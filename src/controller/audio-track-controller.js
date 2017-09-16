/*
 * audio track controller
*/

import Event from '../events';
import EventHandler from '../event-handler';
import {logger} from '../utils/logger';
import {ErrorTypes} from '../errors';

class AudioTrackController extends EventHandler {

  constructor(hls) {
    super(hls, Event.MANIFEST_LOADING,
               Event.MANIFEST_LOADED,
               Event.AUDIO_TRACK_LOADED,
               Event.ERROR);
    this.ticks = 0;
    this.ontick = this.tick.bind(this);
  }

  destroy() {
    this.cleanTimer();
    EventHandler.prototype.destroy.call(this);
  }

  cleanTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  tick() {
    this.ticks++;
    if (this.ticks === 1) {
      this.doTick();
      if (this.ticks > 1) {
        setTimeout(this.tick, 1);
      }
      this.ticks = 0;
    }
  }

  doTick() {
    this.updateTrack(this.trackId);
  }

  onError(data) {
    if(data.fatal && data.type === ErrorTypes.NETWORK_ERROR) {
      this.cleanTimer();
    }
  }

  onManifestLoading() {
    // reset audio tracks on manifest loading
    this.tracks = [];
    this.trackId = -1;
  }

  onManifestLoaded(data) {
    let tracks = data.audioTracks || [];
    // find and select default track
    if (this.defaultTrackId >= 0 && this.defaultTrackId < tracks.length) {
      tracks.forEach(track => {
        track.default = track.id == this.defaultTrackId;
      });
    }
    if (this.defaultTrackName) {
      let id = tracks.map(track => {
        return track.name;
      }).lastIndexOf(this.defaultTrackName);
      if (id !== -1) {
        tracks.forEach(track => {
          track.default = track.id === id;
        });
      }
    }
    if (this.defaultTrackLanguage) {
      let id = tracks.map(track => {
        return track.lang;
      }).lastIndexOf(this.defaultTrackLanguage);
      if (id !== -1) {
        tracks.forEach(track => {
          track.default = track.id === id;
        });
      }
    }
    let defaultFound = false;
    this.tracks = tracks;
    this.hls.trigger(Event.AUDIO_TRACKS_UPDATED, {audioTracks : tracks});
    // loop through available audio tracks and autoselect default if needed
    let id = 0;
    tracks.forEach(track => {
      if(track.default && !defaultFound) {
        this.audioTrack = id;
        defaultFound = true;
        return;
      }
      id++;
    });
    if (defaultFound === false && tracks.length) {
      logger.log('no default audio track defined, use first audio track as default');
      this.audioTrack = 0;
    }
  }

  onAudioTrackLoaded(data) {
    if (data.id < this.tracks.length) {
      logger.log(`audioTrack ${data.id} loaded`);
      this.tracks[data.id].details = data.details;
      // check if current playlist is a live playlist
      if (data.details.live && !this.timer) {
        // if live playlist we will have to reload it periodically
        // set reload period to playlist target duration
        this.timer = setInterval(this.ontick, 1000 * data.details.targetduration);
      }
      if (!data.details.live && this.timer) {
        // playlist is not live and timer is armed : stopping it
        this.cleanTimer();
      }
    }
  }

  /** get alternate audio tracks list from playlist **/
  get audioTracks() {
    return this.tracks;
  }

  /** get index of the selected audio track (index in audio track lists) **/
  get audioTrack() {
   return this.trackId;
  }

  /** select an audio track, based on its index in audio track lists**/
  set audioTrack(audioTrackId) {
    if (this.trackId !== audioTrackId || this.tracks[audioTrackId].details === undefined) {
      this.setAudioTrackInternal(audioTrackId);
    }
  }

  /** get index of the default audio track (index in audio track lists) **/
  get defaultAudioTrack() {
    return this.defaultTrackId;
  }

  /** set a default audio track, based on its index in audio track lists **/
  set defaultAudioTrack(defaultAudioTrackId) {
    this.defaultTrackId = defaultAudioTrackId;
    this.defaultTrackName = undefined;
    this.defaultTrackLanguage = undefined;
  }

  /** get name of the default audio track **/
  get defaultAudioTrackName() {
    return this.defaultTrackName;
  }

  /** set a name audio track **/
  set defaultAudioTrackName(defaultAudioTrackName) {
    this.defaultTrackName = defaultAudioTrackName;
    this.defaultTrackId = undefined;
    this.defaultTrackLanguage = undefined;

    console.log(this.defaultTrackName);
  }

  /** get language of the default audio track **/
  get defaultAudioTrackLanguage() {
    return this.defaultTrackLanguage;
  }

  /** set a language audio track **/
  set defaultAudioTrackLanguage(defaultAudioTrackLanguage) {
    this.defaultTrackLanguage = defaultAudioTrackLanguage;
    this.defaultTrackId = undefined;
    this.defaultTrackName = undefined;
  }

  setAudioTrackInternal(newId) {
    // check if level idx is valid
    if (newId >= 0 && newId < this.tracks.length) {
      // stopping live reloading timer if any
      this.cleanTimer();
      this.trackId = newId;
      logger.log(`switching to audioTrack ${newId}`);
      let audioTrack = this.tracks[newId],
          hls = this.hls,
          type = audioTrack.type,
          url = audioTrack.url,
          eventObj = {id: newId, type : type, url : url};
      // keep AUDIO_TRACK_SWITCH for legacy reason
      hls.trigger(Event.AUDIO_TRACK_SWITCH, eventObj);
      hls.trigger(Event.AUDIO_TRACK_SWITCHING, eventObj);
       // check if we need to load playlist for this audio Track
       let details = audioTrack.details;
      if (url && (details === undefined || details.live === true)) {
        // track not retrieved yet, or live playlist we need to (re)load it
        logger.log(`(re)loading playlist for audioTrack ${newId}`);
        hls.trigger(Event.AUDIO_TRACK_LOADING, {url: url, id: newId});
      }
    }
  }

  updateTrack(newId) {
    // check if level idx is valid
    if (newId >= 0 && newId < this.tracks.length) {
      // stopping live reloading timer if any
      this.cleanTimer();
      this.trackId = newId;
      logger.log(`updating audioTrack ${newId}`);
      let audioTrack = this.tracks[newId], url = audioTrack.url;
       // check if we need to load playlist for this audio Track
       let details = audioTrack.details;
      if (url && (details === undefined || details.live === true)) {
        // track not retrieved yet, or live playlist we need to (re)load it
        logger.log(`(re)loading playlist for audioTrack ${newId}`);
        this.hls.trigger(Event.AUDIO_TRACK_LOADING, {url: url, id: newId});
      }
    }
  }
}

export default AudioTrackController;
