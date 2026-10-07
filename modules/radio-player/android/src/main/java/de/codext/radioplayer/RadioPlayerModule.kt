package de.codext.radioplayer

import android.content.ComponentName
import androidx.core.content.ContextCompat
import androidx.media3.common.C
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import expo.modules.kotlin.Promise
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class StationRecord : Record {
  @Field val id: String = ""
  @Field val url: String = ""
  @Field val title: String = ""
  @Field val subtitle: String? = null
  @Field val artwork: String? = null

  fun toMediaItem() = PlaybackService.buildItem(id, url, title, subtitle, artwork)
}

class RadioPlayerModule : Module() {
  private var controllerFuture: ListenableFuture<MediaController>? = null
  private var controller: MediaController? = null
  private val pending = mutableListOf<Pair<Promise, (MediaController) -> Unit>>()

  private val busListener = object : RadioBus.Listener {
    override fun onState(state: String, error: String?) {
      sendEvent("onStateChange", mapOf("state" to state, "error" to error))
    }

    override fun onSong(song: SongInfo?) {
      sendEvent("onSongChange", mapOf("song" to song?.toMap()))
    }

    override fun onStation(stationId: String) {
      sendEvent("onStationChange", mapOf("stationId" to stationId))
    }

    override fun onSleepTimer(endsAt: Long?) {
      sendEvent("onSleepTimerChange", mapOf("endsAt" to endsAt?.toDouble()))
    }
  }

  override fun definition() = ModuleDefinition {
    Name("RadioPlayer")

    Events("onStateChange", "onSongChange", "onStationChange", "onSleepTimerChange")

    OnCreate {
      RadioBus.addListener(busListener)
    }

    OnDestroy {
      RadioBus.removeListener(busListener)
      controllerFuture?.let { MediaController.releaseFuture(it) }
      controllerFuture = null
      controller = null
    }

    AsyncFunction("play") { station: StationRecord, queue: List<StationRecord>?, promise: Promise ->
      val list = (queue ?: emptyList()).toMutableList()
      if (list.none { it.id == station.id }) list.add(0, station)
      val index = list.indexOfFirst { it.id == station.id }.coerceAtLeast(0)
      val items = list.map { it.toMediaItem() }
      RadioBus.publishSong(null)
      RadioBus.publishState("loading")
      RadioBus.publishStation(station.id)
      withController(promise) { c ->
        c.setMediaItems(items, index, C.TIME_UNSET)
        c.prepare()
        c.play()
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setQueue") { queue: List<StationRecord>, promise: Promise ->
      withController(promise) { c ->
        val currentId = c.currentMediaItem?.mediaId
        if (currentId == null) return@withController
        val currentIndex = c.currentMediaItemIndex
        val newIndex = queue.indexOfFirst { it.id == currentId }
        if (newIndex < 0) {
          if (c.mediaItemCount > 1) {
            c.removeMediaItems(currentIndex + 1, c.mediaItemCount)
            c.removeMediaItems(0, currentIndex)
          }
          c.addMediaItems(queue.map { it.toMediaItem() })
          return@withController
        }
        val before = queue.subList(0, newIndex).map { it.toMediaItem() }
        val after = queue.subList(newIndex + 1, queue.size).map { it.toMediaItem() }
        if (currentIndex + 1 < c.mediaItemCount) c.removeMediaItems(currentIndex + 1, c.mediaItemCount)
        if (currentIndex > 0) c.removeMediaItems(0, currentIndex)
        c.addMediaItems(after)
        c.addMediaItems(0, before)
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("pause") { promise: Promise ->
      withController(promise) { it.pause() }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("resume") { promise: Promise ->
      withController(promise) { it.play() }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("toggle") { promise: Promise ->
      withController(promise) { c -> if (c.playWhenReady) c.pause() else c.play() }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("stop") { promise: Promise ->
      PlaybackService.instance?.cancelSleepTimer()
      withController(promise) { c ->
        c.stop()
        c.clearMediaItems()
        RadioBus.publishSong(null)
        RadioBus.publishState("idle")
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("next") { promise: Promise ->
      withController(promise) { it.seekToNext() }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("previous") { promise: Promise ->
      withController(promise) { it.seekToPrevious() }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("setSleepTimer") { seconds: Double, promise: Promise ->
      withController(promise) { PlaybackService.instance?.setSleepTimer(seconds) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("cancelSleepTimer") {
      PlaybackService.instance?.cancelSleepTimer()
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("getStatus") {
      RadioBus.snapshot()
    }.runOnQueue(Queues.MAIN)
  }

  private fun withController(promise: Promise, action: (MediaController) -> Unit) {
    val existing = controller
    if (existing != null && existing.isConnected) {
      execute(existing, promise, action)
      return
    }
    if (existing != null) {
      controllerFuture?.let { MediaController.releaseFuture(it) }
      controllerFuture = null
    }
    controller = null
    pending.add(promise to action)
    if (controllerFuture != null) return
    val context = appContext.reactContext
    if (context == null) {
      flushPending(null)
      return
    }
    val token = SessionToken(context, ComponentName(context, PlaybackService::class.java))
    val future = MediaController.Builder(context, token).buildAsync()
    controllerFuture = future
    future.addListener({
      val connected = try {
        future.get()
      } catch (e: Exception) {
        null
      }
      if (connected == null) controllerFuture = null
      controller = connected
      flushPending(connected)
    }, ContextCompat.getMainExecutor(context))
  }

  private fun flushPending(c: MediaController?) {
    val queued = pending.toList()
    pending.clear()
    queued.forEach { (promise, action) ->
      if (c == null) {
        promise.reject("ERR_RADIO_PLAYER", "Playback service unavailable", null)
      } else {
        execute(c, promise, action)
      }
    }
  }

  private fun execute(c: MediaController, promise: Promise, action: (MediaController) -> Unit) {
    try {
      action(c)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR_RADIO_PLAYER", e.message, e)
    }
  }
}
