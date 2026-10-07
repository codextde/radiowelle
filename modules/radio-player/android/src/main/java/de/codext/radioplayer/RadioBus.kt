package de.codext.radioplayer

import android.os.Bundle

data class SongInfo(val artist: String?, val title: String?, val raw: String) {
  fun toMap(): Map<String, Any?> = mapOf("artist" to artist, "title" to title, "raw" to raw)
}

object RadioBus {
  interface Listener {
    fun onState(state: String, error: String?)
    fun onSong(song: SongInfo?)
    fun onStation(stationId: String)
    fun onSleepTimer(endsAt: Long?)
  }

  private val listeners = mutableSetOf<Listener>()

  var state: String = "idle"
    private set
  var error: String? = null
    private set
  var stationId: String? = null
    private set
  var song: SongInfo? = null
    private set
  var sleepEndsAt: Long? = null
    private set

  fun addListener(listener: Listener) {
    listeners.add(listener)
  }

  fun removeListener(listener: Listener) {
    listeners.remove(listener)
  }

  fun publishState(newState: String, newError: String? = null) {
    if (newState == state && newError == error) return
    state = newState
    error = newError
    listeners.toList().forEach { it.onState(newState, newError) }
  }

  fun publishSong(newSong: SongInfo?) {
    if (newSong == song) return
    song = newSong
    listeners.toList().forEach { it.onSong(newSong) }
  }

  fun publishStation(id: String) {
    if (id == stationId) return
    stationId = id
    listeners.toList().forEach { it.onStation(id) }
  }

  fun publishSleepTimer(endsAt: Long?) {
    sleepEndsAt = endsAt
    listeners.toList().forEach { it.onSleepTimer(endsAt) }
  }

  fun snapshot(): Map<String, Any?> = mapOf(
    "state" to state,
    "error" to error,
    "stationId" to stationId,
    "song" to song?.toMap(),
    "sleepTimerEndsAt" to sleepEndsAt?.toDouble()
  )
}

object SongParser {
  private val junk = setOf("-", "unknown", "n/a", "na", "live", "stream", "radio", "on air", "onair", "advert", "werbung", "commercial", "jingle")

  fun parse(raw: String, artist: String?, station: String?): SongInfo? {
    val cleaned = raw.trim(' ', '-', '|', '\u0000', '\t', '\n')
    val lowered = cleaned.lowercase()
    if (cleaned.length < 2 || lowered in junk) return null
    if (lowered.startsWith("http") || lowered.contains("www.")) return null
    if (station != null && lowered == station.lowercase()) return null
    if (!artist.isNullOrBlank()) return SongInfo(artist.trim(), cleaned, raw)
    val split = cleaned.indexOf(" - ")
    if (split > 0) {
      val a = cleaned.substring(0, split).trim()
      val t = cleaned.substring(split + 3).trim()
      if (station != null && t.lowercase().startsWith(station.lowercase())) return SongInfo(null, a, raw)
      if (a.isNotEmpty() && t.isNotEmpty()) return SongInfo(a, t, raw)
    }
    return SongInfo(null, cleaned, raw)
  }
}

internal object StationExtras {
  const val TITLE = "stationTitle"
  const val SUBTITLE = "stationSubtitle"

  fun bundle(title: String, subtitle: String?): Bundle = Bundle().apply {
    putString(TITLE, title)
    putString(SUBTITLE, subtitle)
  }
}
