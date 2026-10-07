import AVFoundation
import MediaPlayer
import UIKit

struct Station: Equatable {
  let id: String
  let url: String
  let title: String
  let subtitle: String?
  let artwork: String?
}

enum EngineState: String {
  case idle, loading, playing, paused, error
}

struct SongInfo: Equatable {
  let artist: String?
  let title: String?
  let raw: String
}

protocol RadioEngineDelegate: AnyObject {
  func engine(_ engine: RadioEngine, didChangeState state: EngineState, error: String?)
  func engine(_ engine: RadioEngine, didUpdateSong song: SongInfo?)
  func engine(_ engine: RadioEngine, didChangeStation station: Station)
  func engine(_ engine: RadioEngine, sleepTimerDidChange endsAt: Date?)
}

final class RadioEngine: NSObject, AVPlayerItemMetadataOutputPushDelegate {
  static let shared = RadioEngine()

  weak var delegate: RadioEngineDelegate?

  private let player = AVPlayer()
  private var metadataOutput: AVPlayerItemMetadataOutput?
  private var observations: [NSKeyValueObservation] = []
  private var itemObservations: [NSKeyValueObservation] = []

  private(set) var queue: [Station] = []
  private(set) var index = 0
  private(set) var state: EngineState = .idle
  private(set) var lastError: String?
  private(set) var song: SongInfo?
  private var wantsToPlay = false
  private var retryCount = 0
  private var retryWork: DispatchWorkItem?
  private var watchdog: DispatchWorkItem?
  private var artworkTask: URLSessionDataTask?
  private var artwork: MPMediaItemArtwork?
  private var artworkSource: String?
  private var sleepTimer: Timer?
  private var fadeTimer: Timer?
  private(set) var sleepEndsAt: Date?
  private var volume: Float = 1
  private var resumeAfterInterruption = false
  private var remoteCommandsReady = false

  var current: Station? { queue.indices.contains(index) ? queue[index] : nil }

  private override init() {
    super.init()
    player.automaticallyWaitsToMinimizeStalling = true
    observations.append(player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
      DispatchQueue.main.async { self?.syncState() }
    })
    let center = NotificationCenter.default
    center.addObserver(self, selector: #selector(handleInterruption(_:)), name: AVAudioSession.interruptionNotification, object: nil)
    center.addObserver(self, selector: #selector(handleRouteChange(_:)), name: AVAudioSession.routeChangeNotification, object: nil)
    center.addObserver(self, selector: #selector(handleMediaReset), name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
    center.addObserver(self, selector: #selector(handleFailedToEnd(_:)), name: .AVPlayerItemFailedToPlayToEndTime, object: nil)
    center.addObserver(self, selector: #selector(handleStalled(_:)), name: .AVPlayerItemPlaybackStalled, object: nil)
    center.addObserver(self, selector: #selector(handleEnded(_:)), name: .AVPlayerItemDidPlayToEndTime, object: nil)
  }

  // MARK: Public API

  func play(_ station: Station, queue newQueue: [Station]) {
    var list = newQueue.isEmpty ? [station] : newQueue
    if !list.contains(where: { $0.id == station.id }) {
      list.insert(station, at: 0)
    }
    queue = list
    index = list.firstIndex(where: { $0.id == station.id }) ?? 0
    start(resetRetries: true)
  }

  func setQueue(_ newQueue: [Station]) {
    guard let current = current else {
      queue = newQueue
      index = 0
      return
    }
    var list = newQueue
    if !list.contains(where: { $0.id == current.id }) {
      list.insert(current, at: 0)
    }
    queue = list
    index = list.firstIndex(where: { $0.id == current.id }) ?? 0
    updateRemoteCommandAvailability()
  }

  func resume() {
    guard current != nil else { return }
    if player.currentItem == nil || player.currentItem?.status == .failed || state == .error || isLiveEdgeStale() {
      start(resetRetries: true)
      return
    }
    wantsToPlay = true
    activateSession()
    player.play()
    armWatchdog()
    syncState()
  }

  func pause() {
    wantsToPlay = false
    resumeAfterInterruption = false
    cancelRetry()
    player.pause()
    pausedAt = Date()
    setState(.paused)
  }

  func toggle() {
    if wantsToPlay { pause() } else { resume() }
  }

  func stop() {
    wantsToPlay = false
    resumeAfterInterruption = false
    cancelRetry()
    cancelSleepTimer()
    player.pause()
    replaceItem(nil)
    song = nil
    delegate?.engine(self, didUpdateSong: nil)
    setState(.idle)
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    MPNowPlayingInfoCenter.default().playbackState = .stopped
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  func next() { skip(by: 1) }
  func previous() { skip(by: -1) }

  func setSleepTimer(seconds: Double) {
    cancelSleepTimer()
    guard seconds > 0 else { return }
    let endsAt = Date().addingTimeInterval(seconds)
    sleepEndsAt = endsAt
    let fadeLength = min(30, seconds)
    let fadeStart = seconds - fadeLength
    sleepTimer = Timer.scheduledTimer(withTimeInterval: fadeStart, repeats: false) { [weak self] _ in
      guard let self = self else { return }
      if let ends = self.sleepEndsAt, Date().timeIntervalSince(ends) > 5 {
        self.cancelSleepTimer()
        return
      }
      self.beginFadeOut(duration: fadeLength)
    }
    delegate?.engine(self, sleepTimerDidChange: endsAt)
  }

  func cancelSleepTimer() {
    sleepTimer?.invalidate()
    sleepTimer = nil
    fadeTimer?.invalidate()
    fadeTimer = nil
    player.volume = volume
    if sleepEndsAt != nil {
      sleepEndsAt = nil
      delegate?.engine(self, sleepTimerDidChange: nil)
    }
  }

  // MARK: Playback

  private var pausedAt: Date?

  private func isLiveEdgeStale() -> Bool {
    guard let pausedAt = pausedAt else { return false }
    return Date().timeIntervalSince(pausedAt) > 30
  }

  private func skip(by delta: Int) {
    guard queue.count > 1 else { return }
    index = (index + delta + queue.count) % queue.count
    start(resetRetries: true)
  }

  private func start(resetRetries: Bool) {
    guard let station = current, let url = URL(string: station.url) else {
      fail("invalid_url")
      return
    }
    if resetRetries { retryCount = 0 }
    cancelRetry()
    wantsToPlay = true
    pausedAt = nil
    lastError = nil
    if song != nil {
      song = nil
      delegate?.engine(self, didUpdateSong: nil)
    }
    activateSession()
    setupRemoteCommands()

    let asset = AVURLAsset(url: url, options: [
      "AVURLAssetHTTPHeaderFieldsKey": ["User-Agent": "Radiowelle/1.0 (iOS)", "Icy-MetaData": "1"]
    ])
    let item = AVPlayerItem(asset: asset)
    item.preferredForwardBufferDuration = 4
    replaceItem(item)
    player.volume = volume
    player.play()
    setState(.loading)
    armWatchdog()
    delegate?.engine(self, didChangeStation: station)
    updateNowPlaying()
    loadArtwork(for: station)
    updateRemoteCommandAvailability()
  }

  private func replaceItem(_ item: AVPlayerItem?) {
    itemObservations.forEach { $0.invalidate() }
    itemObservations = []
    if let output = metadataOutput, let old = player.currentItem {
      old.remove(output)
    }
    metadataOutput = nil
    player.replaceCurrentItem(with: item)
    guard let item = item else { return }

    let output = AVPlayerItemMetadataOutput(identifiers: nil)
    output.setDelegate(self, queue: .main)
    item.add(output)
    metadataOutput = output

    itemObservations.append(item.observe(\.status, options: [.new]) { [weak self] item, _ in
      DispatchQueue.main.async {
        guard let self = self, item === self.player.currentItem else { return }
        if item.status == .failed {
          self.handleFailure(item.error)
        } else {
          self.syncState()
        }
      }
    })
  }

  private func syncState() {
    guard player.currentItem != nil else { return }
    if !wantsToPlay {
      if state != .error && state != .idle { setState(.paused) }
      return
    }
    switch player.timeControlStatus {
    case .playing:
      retryCount = 0
      disarmWatchdog()
      setState(.playing)
    case .waitingToPlayAtSpecifiedRate:
      setState(.loading)
    case .paused:
      if player.currentItem?.status == .failed { return }
      setState(.loading)
    @unknown default:
      break
    }
  }

  private func setState(_ newState: EngineState, error: String? = nil) {
    if newState == state && error == lastError { return }
    state = newState
    lastError = error
    let center = MPNowPlayingInfoCenter.default()
    switch newState {
    case .playing: center.playbackState = .playing
    case .loading: center.playbackState = .playing
    case .paused: center.playbackState = .paused
    case .idle, .error: center.playbackState = .stopped
    }
    updateNowPlaying()
    delegate?.engine(self, didChangeState: newState, error: error)
  }

  private func handleFailure(_ error: Error?) {
    guard wantsToPlay else { return }
    let maxRetries = 6
    if retryCount < maxRetries {
      retryCount += 1
      let delay = min(pow(2.0, Double(retryCount - 1)), 15)
      setState(.loading)
      let work = DispatchWorkItem { [weak self] in
        guard let self = self, self.wantsToPlay else { return }
        self.start(resetRetries: false)
      }
      retryWork = work
      DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    } else {
      fail(classify(error))
    }
  }

  private func classify(_ error: Error?) -> String {
    guard let error = error as NSError? else { return "stream_unavailable" }
    if error.domain == NSURLErrorDomain {
      switch error.code {
      case NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorDataNotAllowed, NSURLErrorInternationalRoamingOff:
        return "offline"
      default:
        return "stream_unavailable"
      }
    }
    if let underlying = error.userInfo[NSUnderlyingErrorKey] as? NSError, underlying.domain == NSURLErrorDomain,
       underlying.code == NSURLErrorNotConnectedToInternet {
      return "offline"
    }
    return "stream_unavailable"
  }

  private func fail(_ code: String) {
    wantsToPlay = false
    cancelRetry()
    player.pause()
    setState(.error, error: code)
  }

  private func cancelRetry() {
    retryWork?.cancel()
    retryWork = nil
    disarmWatchdog()
  }

  private func armWatchdog() {
    disarmWatchdog()
    let work = DispatchWorkItem { [weak self] in
      guard let self = self, self.wantsToPlay, self.state == .loading else { return }
      self.handleFailure(nil)
    }
    watchdog = work
    DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: work)
  }

  private func disarmWatchdog() {
    watchdog?.cancel()
    watchdog = nil
  }

  private func beginFadeOut(duration: Double) {
    let steps = max(1, Int(duration * 10))
    var step = 0
    let startVolume = player.volume
    fadeTimer?.invalidate()
    fadeTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] timer in
      guard let self = self else { timer.invalidate(); return }
      step += 1
      self.player.volume = startVolume * max(0, 1 - Float(step) / Float(steps))
      if step >= steps {
        timer.invalidate()
        self.fadeTimer = nil
        self.sleepTimer = nil
        self.sleepEndsAt = nil
        self.pause()
        self.player.volume = self.volume
        self.delegate?.engine(self, sleepTimerDidChange: nil)
      }
    }
  }

  // MARK: Audio session

  private func activateSession() {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(.playback, mode: .default, policy: .longFormAudio, options: [])
      try session.setActive(true)
    } catch {
      try? session.setCategory(.playback)
      try? session.setActive(true)
    }
  }

  @objc private func handleInterruption(_ notification: Notification) {
    guard let info = notification.userInfo,
          let typeValue = info[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }
    DispatchQueue.main.async {
      switch type {
      case .began:
        self.resumeAfterInterruption = self.wantsToPlay
        if self.wantsToPlay {
          self.player.pause()
          self.wantsToPlay = false
          self.pausedAt = Date()
          self.setState(.paused)
        }
      case .ended:
        let optionsValue = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
        let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)
        if self.resumeAfterInterruption && options.contains(.shouldResume) {
          self.start(resetRetries: true)
        }
        self.resumeAfterInterruption = false
      @unknown default:
        break
      }
    }
  }

  @objc private func handleRouteChange(_ notification: Notification) {
    guard let info = notification.userInfo,
          let reasonValue = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else { return }
    if reason == .oldDeviceUnavailable {
      DispatchQueue.main.async {
        if self.wantsToPlay { self.pause() }
      }
    }
  }

  @objc private func handleMediaReset() {
    DispatchQueue.main.async {
      if self.wantsToPlay { self.start(resetRetries: true) }
    }
  }

  @objc private func handleFailedToEnd(_ notification: Notification) {
    guard let item = notification.object as? AVPlayerItem, item === player.currentItem else { return }
    let error = notification.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error
    DispatchQueue.main.async { self.handleFailure(error) }
  }

  @objc private func handleStalled(_ notification: Notification) {
    guard let item = notification.object as? AVPlayerItem, item === player.currentItem else { return }
    DispatchQueue.main.async {
      guard self.wantsToPlay else { return }
      self.setState(.loading)
      self.armWatchdog()
    }
  }

  @objc private func handleEnded(_ notification: Notification) {
    guard let item = notification.object as? AVPlayerItem, item === player.currentItem else { return }
    DispatchQueue.main.async {
      if self.wantsToPlay { self.handleFailure(nil) }
    }
  }

  // MARK: Metadata

  func metadataOutput(_ output: AVPlayerItemMetadataOutput, didOutputTimedMetadataGroups groups: [AVTimedMetadataGroup], from track: AVPlayerItemTrack?) {
    guard output === metadataOutput else { return }
    var title: String?
    var artist: String?
    for group in groups {
      for item in group.items {
        let identifier = item.identifier?.rawValue ?? ""
        let value = item.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let value = value, !value.isEmpty else { continue }
        if identifier == "icy/StreamTitle" || identifier.hasSuffix("/TIT2") || item.commonKey == .commonKeyTitle {
          title = title ?? value
        } else if identifier.hasSuffix("/TPE1") || item.commonKey == .commonKeyArtist {
          artist = artist ?? value
        }
      }
    }
    guard let rawTitle = title else { return }
    let info = SongParser.parse(raw: rawTitle, artist: artist, station: current?.title)
    if info != song {
      song = info
      updateNowPlaying()
      delegate?.engine(self, didUpdateSong: info)
    }
  }

  // MARK: Now playing

  private func updateNowPlaying() {
    guard let station = current else { return }
    var info: [String: Any] = [
      MPNowPlayingInfoPropertyIsLiveStream: true,
      MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
      MPNowPlayingInfoPropertyPlaybackRate: state == .playing ? 1.0 : 0.0
    ]
    if let song = song, let songTitle = song.title {
      info[MPMediaItemPropertyTitle] = songTitle
      info[MPMediaItemPropertyArtist] = [song.artist, station.title].compactMap { $0 }.joined(separator: " · ")
    } else {
      info[MPMediaItemPropertyTitle] = station.title
      if let subtitle = station.subtitle { info[MPMediaItemPropertyArtist] = subtitle }
    }
    info[MPMediaItemPropertyAlbumTitle] = station.title
    if let artwork = artwork, artworkSource == station.artwork {
      info[MPMediaItemPropertyArtwork] = artwork
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  private func loadArtwork(for station: Station) {
    artworkTask?.cancel()
    guard let source = station.artwork, let url = URL(string: source) else {
      artwork = nil
      artworkSource = nil
      return
    }
    if artworkSource == source, artwork != nil { return }
    if url.isFileURL {
      if let image = UIImage(contentsOfFile: url.path) {
        setArtwork(image, source: source)
      }
      return
    }
    artworkTask = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
      guard let data = data, let image = UIImage(data: data) else { return }
      DispatchQueue.main.async { self?.setArtwork(image, source: source) }
    }
    artworkTask?.resume()
  }

  private func setArtwork(_ image: UIImage, source: String) {
    let padded = ArtworkRenderer.render(image)
    artwork = MPMediaItemArtwork(boundsSize: padded.size) { _ in padded }
    artworkSource = source
    updateNowPlaying()
  }

  // MARK: Remote commands

  private func setupRemoteCommands() {
    guard !remoteCommandsReady else { return }
    remoteCommandsReady = true
    let center = MPRemoteCommandCenter.shared()
    center.playCommand.addTarget { [weak self] _ in
      DispatchQueue.main.async { self?.resume() }
      return .success
    }
    center.pauseCommand.addTarget { [weak self] _ in
      DispatchQueue.main.async { self?.pause() }
      return .success
    }
    center.stopCommand.addTarget { [weak self] _ in
      DispatchQueue.main.async { self?.pause() }
      return .success
    }
    center.togglePlayPauseCommand.addTarget { [weak self] _ in
      DispatchQueue.main.async { self?.toggle() }
      return .success
    }
    center.nextTrackCommand.addTarget { [weak self] _ in
      DispatchQueue.main.async { self?.next() }
      return .success
    }
    center.previousTrackCommand.addTarget { [weak self] _ in
      DispatchQueue.main.async { self?.previous() }
      return .success
    }
    [center.skipForwardCommand, center.skipBackwardCommand, center.seekForwardCommand,
     center.seekBackwardCommand, center.changePlaybackPositionCommand, center.changePlaybackRateCommand].forEach {
      $0.isEnabled = false
    }
  }

  private func updateRemoteCommandAvailability() {
    let center = MPRemoteCommandCenter.shared()
    let canSkip = queue.count > 1
    center.nextTrackCommand.isEnabled = canSkip
    center.previousTrackCommand.isEnabled = canSkip
  }
}

enum SongParser {
  private static let junk: Set<String> = ["-", "unknown", "n/a", "na", "live", "stream", "radio", "on air", "onair", "advert", "werbung", "commercial", "jingle"]

  static func parse(raw: String, artist: String?, station: String?) -> SongInfo? {
    let cleaned = raw.trimmingCharacters(in: CharacterSet(charactersIn: " -|\u{0}\t\n"))
    let lowered = cleaned.lowercased()
    if cleaned.count < 2 || junk.contains(lowered) { return nil }
    if lowered.hasPrefix("http") || lowered.contains("www.") { return nil }
    if let station = station?.lowercased(), lowered == station { return nil }
    if let artist = artist, !artist.isEmpty {
      return SongInfo(artist: artist, title: cleaned, raw: raw)
    }
    if let range = cleaned.range(of: " - ") {
      let a = cleaned[..<range.lowerBound].trimmingCharacters(in: .whitespaces)
      let t = cleaned[range.upperBound...].trimmingCharacters(in: .whitespaces)
      if let station = station?.lowercased(), t.lowercased().hasPrefix(station) {
        return SongInfo(artist: nil, title: a, raw: raw)
      }
      if !a.isEmpty && !t.isEmpty { return SongInfo(artist: a, title: t, raw: raw) }
    }
    return SongInfo(artist: nil, title: cleaned, raw: raw)
  }
}

enum ArtworkRenderer {
  static func render(_ image: UIImage) -> UIImage {
    let side: CGFloat = 600
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format)
    let canvas = CGRect(x: 0, y: 0, width: side, height: side)
    let edge = edgeColor(of: image)
    return renderer.image { context in
      (edge ?? .white).setFill()
      context.fill(canvas)
      let w = max(image.size.width, 1)
      let h = max(image.size.height, 1)
      if edge != nil && min(w, h) / max(w, h) > 0.98 {
        image.draw(in: canvas.insetBy(dx: -1, dy: -1))
        return
      }
      let box = edge != nil ? canvas : canvas.insetBy(dx: side * 0.12, dy: side * 0.12)
      let ratio = min(box.width / w, box.height / h)
      let size = CGSize(width: w * ratio, height: h * ratio)
      image.draw(in: CGRect(origin: CGPoint(x: box.midX - size.width / 2, y: box.midY - size.height / 2), size: size))
    }
  }

  /// Average border colour when the image is opaque and uniform along its edges (a solid tile), else nil.
  private static func edgeColor(of image: UIImage) -> UIColor? {
    guard let cg = image.cgImage else { return nil }
    let n = 32
    var px = [UInt8](repeating: 0, count: n * n * 4)
    guard let ctx = CGContext(data: &px, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4,
                              space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    ctx.interpolationQuality = .medium
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: n, height: n))
    var samples: [(Double, Double, Double)] = []
    for i in 0..<n {
      for (x, y) in [(i, 0), (i, n - 1), (0, i), (n - 1, i)] {
        let o = (y * n + x) * 4
        if px[o + 3] < 245 { return nil }
        samples.append((Double(px[o]), Double(px[o + 1]), Double(px[o + 2])))
      }
    }
    let count = Double(samples.count)
    let r = samples.reduce(0) { $0 + $1.0 } / count
    let g = samples.reduce(0) { $0 + $1.1 } / count
    let b = samples.reduce(0) { $0 + $1.2 } / count
    let close = samples.filter { abs($0.0 - r) + abs($0.1 - g) + abs($0.2 - b) < 40 }.count
    let square = min(image.size.width, image.size.height) / max(image.size.width, image.size.height, 1) > 0.98
    if !square && Double(close) / count < 0.9 { return nil }
    return UIColor(red: r / 255, green: g / 255, blue: b / 255, alpha: 1)
  }
}
