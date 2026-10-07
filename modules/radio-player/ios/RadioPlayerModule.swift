import AVKit
import ExpoModulesCore

struct StationRecord: Record {
  @Field var id: String = ""
  @Field var url: String = ""
  @Field var title: String = ""
  @Field var subtitle: String?
  @Field var artwork: String?

  var station: Station {
    Station(id: id, url: url, title: title, subtitle: subtitle, artwork: artwork)
  }
}

public class RadioPlayerModule: Module, RadioEngineDelegate {
  private var engine: RadioEngine { RadioEngine.shared }

  public func definition() -> ModuleDefinition {
    Name("RadioPlayer")

    Events("onStateChange", "onSongChange", "onStationChange", "onSleepTimerChange")

    OnCreate {
      DispatchQueue.main.async { RadioEngine.shared.delegate = self }
    }

    OnDestroy {
      DispatchQueue.main.async {
        if RadioEngine.shared.delegate === self { RadioEngine.shared.delegate = nil }
      }
    }

    AsyncFunction("play") { (station: StationRecord, queue: [StationRecord]?) in
      self.engine.play(station.station, queue: (queue ?? []).map { $0.station })
    }.runOnQueue(.main)

    AsyncFunction("setQueue") { (queue: [StationRecord]) in
      self.engine.setQueue(queue.map { $0.station })
    }.runOnQueue(.main)

    AsyncFunction("pause") {
      self.engine.pause()
    }.runOnQueue(.main)

    AsyncFunction("resume") {
      self.engine.resume()
    }.runOnQueue(.main)

    AsyncFunction("toggle") {
      self.engine.toggle()
    }.runOnQueue(.main)

    AsyncFunction("stop") {
      self.engine.stop()
    }.runOnQueue(.main)

    AsyncFunction("next") {
      self.engine.next()
    }.runOnQueue(.main)

    AsyncFunction("previous") {
      self.engine.previous()
    }.runOnQueue(.main)

    AsyncFunction("setSleepTimer") { (seconds: Double) in
      self.engine.setSleepTimer(seconds: seconds)
    }.runOnQueue(.main)

    AsyncFunction("cancelSleepTimer") {
      self.engine.cancelSleepTimer()
    }.runOnQueue(.main)

    AsyncFunction("getStatus") { () -> [String: Any?] in
      self.status()
    }.runOnQueue(.main)

    View(RoutePickerView.self) {
      Prop("tint") { (view: RoutePickerView, color: UIColor?) in
        view.picker.tintColor = color
      }
      Prop("activeTint") { (view: RoutePickerView, color: UIColor?) in
        view.picker.activeTintColor = color
      }
    }
  }

  private func status() -> [String: Any?] {
    [
      "state": engine.state.rawValue,
      "error": engine.lastError,
      "stationId": engine.current?.id,
      "song": songPayload(engine.song),
      "sleepTimerEndsAt": engine.sleepEndsAt.map { $0.timeIntervalSince1970 * 1000 }
    ]
  }

  private func songPayload(_ song: SongInfo?) -> [String: Any?]? {
    guard let song = song else { return nil }
    return ["artist": song.artist, "title": song.title, "raw": song.raw]
  }

  func engine(_ engine: RadioEngine, didChangeState state: EngineState, error: String?) {
    sendEvent("onStateChange", ["state": state.rawValue, "error": error])
  }

  func engine(_ engine: RadioEngine, didUpdateSong song: SongInfo?) {
    sendEvent("onSongChange", ["song": songPayload(song)])
  }

  func engine(_ engine: RadioEngine, didChangeStation station: Station) {
    sendEvent("onStationChange", ["stationId": station.id])
  }

  func engine(_ engine: RadioEngine, sleepTimerDidChange endsAt: Date?) {
    sendEvent("onSleepTimerChange", ["endsAt": endsAt.map { $0.timeIntervalSince1970 * 1000 }])
  }
}

final class RoutePickerView: ExpoView {
  let picker = AVRoutePickerView()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = false
    picker.prioritizesVideoDevices = false
    addSubview(picker)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    picker.frame = bounds
  }
}
