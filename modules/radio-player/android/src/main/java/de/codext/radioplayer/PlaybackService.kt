package de.codext.radioplayer

import android.app.PendingIntent
import android.content.Intent
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import androidx.annotation.OptIn
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.ForwardingPlayer
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Metadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DefaultDataSource
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.extractor.metadata.icy.IcyInfo
import androidx.media3.extractor.metadata.id3.TextInformationFrame
import androidx.media3.session.DefaultMediaNotificationProvider
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
  private var session: MediaSession? = null
  private lateinit var exo: ExoPlayer
  private val handler = Handler(Looper.getMainLooper())
  private var retryCount = 0
  private var retryRunnable: Runnable? = null
  private var watchdogRunnable: Runnable? = null
  private var sleepRunnable: Runnable? = null
  private var fadeRunnable: Runnable? = null
  private var pausedAt = 0L
  private var currentMediaId: String? = null
  private var wantsToPlay = false

  override fun onCreate() {
    super.onCreate()
    instance = this
    val http = DefaultHttpDataSource.Factory()
      .setUserAgent("Radiowelle/1.0 (Android)")
      .setAllowCrossProtocolRedirects(true)
      .setConnectTimeoutMs(15_000)
      .setReadTimeoutMs(20_000)
    val mediaSourceFactory = DefaultMediaSourceFactory(DefaultDataSource.Factory(this, http))
      .setLoadErrorHandlingPolicy(DefaultLoadErrorHandlingPolicy(4))

    exo = ExoPlayer.Builder(this)
      .setMediaSourceFactory(mediaSourceFactory)
      .setAudioAttributes(
        AudioAttributes.Builder()
          .setUsage(C.USAGE_MEDIA)
          .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
          .build(),
        true
      )
      .setHandleAudioBecomingNoisy(true)
      .setWakeMode(C.WAKE_MODE_NETWORK)
      .build()
    exo.repeatMode = Player.REPEAT_MODE_ONE
    exo.addListener(listener)

    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val builder = MediaSession.Builder(this, RadioPlayer(exo)).setCallback(callback)
    if (launch != null) {
      builder.setSessionActivity(
        PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
      )
    }
    session = builder.build()

    val provider = DefaultMediaNotificationProvider.Builder(this).build()
    provider.setSmallIcon(R.drawable.radiowelle_notification)
    setMediaNotificationProvider(provider)
  }

  override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = session

  override fun onTaskRemoved(rootIntent: Intent?) {
    val player = session?.player
    if (player == null || !player.playWhenReady || player.mediaItemCount == 0) {
      pauseAllPlayersAndStopSelf()
    }
  }

  override fun onDestroy() {
    cancelSleepTimer()
    cancelRetry()
    session?.run {
      player.release()
      release()
    }
    session = null
    if (instance === this) instance = null
    RadioBus.publishState("idle")
    super.onDestroy()
  }

  fun setSleepTimer(seconds: Double) {
    cancelSleepTimer()
    if (seconds <= 0) return
    val totalMs = (seconds * 1000).toLong()
    val fadeMs = minOf(30_000L, totalMs)
    val endsAt = System.currentTimeMillis() + totalMs
    val runnable = Runnable {
      if (System.currentTimeMillis() > endsAt + 5_000) cancelSleepTimer() else beginFadeOut(fadeMs)
    }
    sleepRunnable = runnable
    handler.postDelayed(runnable, totalMs - fadeMs)
    RadioBus.publishSleepTimer(endsAt)
  }

  fun cancelSleepTimer() {
    sleepRunnable?.let { handler.removeCallbacks(it) }
    fadeRunnable?.let { handler.removeCallbacks(it) }
    sleepRunnable = null
    fadeRunnable = null
    if (::exo.isInitialized) exo.volume = 1f
    if (RadioBus.sleepEndsAt != null) RadioBus.publishSleepTimer(null)
  }

  private fun beginFadeOut(durationMs: Long) {
    val steps = maxOf(1, (durationMs / 100).toInt())
    var step = 0
    val runnable = object : Runnable {
      override fun run() {
        step += 1
        exo.volume = maxOf(0f, 1f - step.toFloat() / steps)
        if (step >= steps) {
          fadeRunnable = null
          sleepRunnable = null
          session?.player?.pause()
          exo.volume = 1f
          RadioBus.publishSleepTimer(null)
        } else {
          handler.postDelayed(this, 100)
        }
      }
    }
    fadeRunnable = runnable
    handler.post(runnable)
  }

  private inner class RadioPlayer(player: ExoPlayer) : ForwardingPlayer(player) {
    override fun play() {
      wantsToPlay = true
      retryCount = 0
      val stale = pausedAt > 0 && SystemClock.elapsedRealtime() - pausedAt > 30_000
      if (exo.playbackState == Player.STATE_IDLE || exo.playerError != null || stale) {
        restart()
        return
      }
      super.play()
      pausedAt = 0
      if (!exo.isPlaying) armWatchdog()
    }

    override fun pause() {
      wantsToPlay = false
      cancelRetry()
      pausedAt = SystemClock.elapsedRealtime()
      super.pause()
    }

    override fun stop() {
      wantsToPlay = false
      cancelRetry()
      super.stop()
    }

    override fun seekToNext() = wrap(1)

    override fun seekToPrevious() = wrap(-1)

    override fun seekToNextMediaItem() = wrap(1)

    override fun seekToPreviousMediaItem() = wrap(-1)

    private fun wrap(delta: Int) {
      val count = mediaItemCount
      if (count < 2) return
      retryCount = 0
      exo.seekToDefaultPosition((currentMediaItemIndex + delta + count) % count)
      restart()
    }

    override fun getAvailableCommands(): Player.Commands {
      val builder = super.getAvailableCommands().buildUpon()
        .remove(Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM)
        .remove(Player.COMMAND_SEEK_BACK)
        .remove(Player.COMMAND_SEEK_FORWARD)
      if (mediaItemCount < 2) {
        builder.remove(Player.COMMAND_SEEK_TO_NEXT)
          .remove(Player.COMMAND_SEEK_TO_PREVIOUS)
          .remove(Player.COMMAND_SEEK_TO_NEXT_MEDIA_ITEM)
          .remove(Player.COMMAND_SEEK_TO_PREVIOUS_MEDIA_ITEM)
      } else {
        builder.add(Player.COMMAND_SEEK_TO_NEXT).add(Player.COMMAND_SEEK_TO_PREVIOUS)
      }
      return builder.build()
    }

    override fun isCommandAvailable(command: Int): Boolean = availableCommands.contains(command)
  }

  private fun restart() {
    wantsToPlay = true
    pausedAt = 0
    cancelRetry()
    exo.stop()
    exo.prepare()
    exo.play()
    armWatchdog()
  }

  private val callback = object : MediaSession.Callback {
    override fun onAddMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>
    ): ListenableFuture<MutableList<MediaItem>> {
      val resolved = mediaItems.map { item ->
        val uri = item.localConfiguration?.uri ?: item.requestMetadata.mediaUri
        if (uri != null) item.buildUpon().setUri(uri).build() else item
      }.toMutableList()
      return Futures.immediateFuture(resolved)
    }

    override fun onSetMediaItems(
      mediaSession: MediaSession,
      controller: MediaSession.ControllerInfo,
      mediaItems: MutableList<MediaItem>,
      startIndex: Int,
      startPositionMs: Long
    ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
      wantsToPlay = true
      retryCount = 0
      pausedAt = 0
      val resolved = mediaItems.map { item ->
        val uri = item.localConfiguration?.uri ?: item.requestMetadata.mediaUri
        if (uri != null) item.buildUpon().setUri(uri).build() else item
      }
      return Futures.immediateFuture(MediaSession.MediaItemsWithStartPosition(resolved, startIndex, startPositionMs))
    }
  }

  private val listener = object : Player.Listener {
    override fun onEvents(player: Player, events: Player.Events) {
      if (events.containsAny(
          Player.EVENT_PLAYBACK_STATE_CHANGED,
          Player.EVENT_PLAY_WHEN_READY_CHANGED,
          Player.EVENT_IS_PLAYING_CHANGED,
          Player.EVENT_PLAYBACK_SUPPRESSION_REASON_CHANGED,
          Player.EVENT_PLAYER_ERROR
        )
      ) {
        syncState()
      }
    }

    override fun onPlayWhenReadyChanged(playWhenReady: Boolean, reason: Int) {
      if (!playWhenReady && reason != Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST) {
        wantsToPlay = false
        cancelRetry()
        pausedAt = SystemClock.elapsedRealtime()
      }
    }

    override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
      val id = mediaItem?.mediaId ?: return
      if (id != currentMediaId) {
        currentMediaId = id
        retryCount = 0
        RadioBus.publishSong(null)
        RadioBus.publishStation(id)
        if (exo.playWhenReady) armWatchdog()
      }
    }

    override fun onPlayerError(error: PlaybackException) {
      handleError(error)
    }

    override fun onMetadata(metadata: Metadata) {
      var title: String? = null
      var artist: String? = null
      for (i in 0 until metadata.length()) {
        when (val entry = metadata.get(i)) {
          is IcyInfo -> if (title == null) title = entry.title
          is TextInformationFrame -> when (entry.id) {
            "TIT2" -> if (title == null) title = entry.values.firstOrNull()
            "TPE1" -> if (artist == null) artist = entry.values.firstOrNull()
          }
        }
      }
      val raw = title?.trim()
      if (raw.isNullOrEmpty()) return
      val item = exo.currentMediaItem ?: return
      val extras = item.mediaMetadata.extras
      val stationTitle = extras?.getString(StationExtras.TITLE) ?: item.mediaMetadata.station?.toString()
      val stationSubtitle = extras?.getString(StationExtras.SUBTITLE)
      val song = SongParser.parse(raw, artist, stationTitle)
      if (song == RadioBus.song) return
      RadioBus.publishSong(song)
      val meta = item.mediaMetadata.buildUpon()
      if (song?.title != null) {
        meta.setTitle(song.title)
        meta.setArtist(listOfNotNull(song.artist, stationTitle).joinToString(" · "))
      } else {
        meta.setTitle(stationTitle)
        meta.setArtist(stationSubtitle)
      }
      val index = exo.currentMediaItemIndex
      exo.replaceMediaItem(index, item.buildUpon().setMediaMetadata(meta.build()).build())
    }
  }

  private fun syncState() {
    val error = exo.playerError
    if (error != null && retryRunnable == null && retryCount >= MAX_RETRIES) {
      RadioBus.publishState("error", classify(error))
      return
    }
    when {
      exo.mediaItemCount == 0 -> RadioBus.publishState("idle")
      retryRunnable != null -> RadioBus.publishState("loading")
      exo.isPlaying -> {
        retryCount = 0
        disarmWatchdog()
        RadioBus.publishState("playing")
      }
      exo.playWhenReady && exo.playbackSuppressionReason != Player.PLAYBACK_SUPPRESSION_REASON_NONE -> RadioBus.publishState("paused")
      exo.playWhenReady && (exo.playbackState == Player.STATE_BUFFERING || exo.playbackState == Player.STATE_READY) ->
        RadioBus.publishState("loading")
      exo.playWhenReady && exo.playbackState == Player.STATE_ENDED -> handleError(null)
      !exo.playWhenReady && exo.playbackState != Player.STATE_IDLE -> RadioBus.publishState("paused")
      !exo.playWhenReady && exo.playbackState == Player.STATE_IDLE && RadioBus.state != "error" -> RadioBus.publishState("paused")
    }
  }

  private fun handleError(error: PlaybackException?) {
    if (!wantsToPlay) return
    if (error?.errorCode == PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW) {
      exo.seekToDefaultPosition()
      exo.prepare()
      return
    }
    if (retryCount < MAX_RETRIES) {
      retryCount += 1
      val delay = minOf(1000L shl (retryCount - 1), 15_000L)
      cancelRetry()
      val runnable = Runnable {
        retryRunnable = null
        if (wantsToPlay) restart()
      }
      retryRunnable = runnable
      handler.postDelayed(runnable, delay)
      RadioBus.publishState("loading")
    } else {
      wantsToPlay = false
      cancelRetry()
      exo.playWhenReady = false
      RadioBus.publishState("error", classify(error))
    }
  }

  private fun classify(error: PlaybackException?): String {
    val cm = getSystemService(ConnectivityManager::class.java)
    val caps = cm?.getNetworkCapabilities(cm.activeNetwork)
    val online = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    if (!online) return "offline"
    return when (error?.errorCode) {
      PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
      PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT -> "stream_unavailable"
      else -> "stream_unavailable"
    }
  }

  private fun cancelRetry() {
    retryRunnable?.let { handler.removeCallbacks(it) }
    retryRunnable = null
    disarmWatchdog()
  }

  private fun armWatchdog() {
    disarmWatchdog()
    val runnable = Runnable {
      watchdogRunnable = null
      if (wantsToPlay && !exo.isPlaying) handleError(null)
    }
    watchdogRunnable = runnable
    handler.postDelayed(runnable, 20_000)
  }

  private fun disarmWatchdog() {
    watchdogRunnable?.let { handler.removeCallbacks(it) }
    watchdogRunnable = null
  }

  companion object {
    private const val MAX_RETRIES = 6
    var instance: PlaybackService? = null
      private set

    fun buildItem(id: String, url: String, title: String, subtitle: String?, artwork: String?): MediaItem {
      val uri = Uri.parse(url)
      val metadata = MediaMetadata.Builder()
        .setTitle(title)
        .setStation(title)
        .setArtist(subtitle)
        .setDisplayTitle(title)
        .setIsPlayable(true)
        .setIsBrowsable(false)
        .setMediaType(MediaMetadata.MEDIA_TYPE_RADIO_STATION)
        .setExtras(StationExtras.bundle(title, subtitle))
      if (!artwork.isNullOrEmpty()) metadata.setArtworkUri(Uri.parse(artwork))
      return MediaItem.Builder()
        .setMediaId(id)
        .setUri(uri)
        .setRequestMetadata(MediaItem.RequestMetadata.Builder().setMediaUri(uri).build())
        .setMediaMetadata(metadata.build())
        .build()
    }
  }
}
