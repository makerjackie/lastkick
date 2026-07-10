# Audio sources

## Stadium goal cheer

`stadium-goal-cheer-cc0.mp3` is an edited web preview of **Goal.wav** by
Sandermotions on Freesound:

- Source: https://freesound.org/people/Sandermotions/sounds/494352/
- Preview used: https://cdn.freesound.org/previews/494/494352_1402315-hq.mp3
- License: Creative Commons 0 (CC0)
- Original recording: a field recording of a football match in Cambuur Stadium,
  Leeuwarden, recorded on a Zoom H1

The local derivative takes the goal-reaction section from `00:05.48` for 8.2
seconds, repairs clipped samples with FFmpeg's `adeclip`, removes unusable
sub-bass and ultrasonic content, attenuates by 14 dB, and adds short entry and
exit fades. The shipped MP3 is stereo, 48 kHz, 160 kbps, approximately `-17.2
LUFS`, and has SHA-256
`4714950e9bed8eb5b23f1da4f80e3bbfa2aaeba8d3e49818c707c409fb6d9e52`.

Attribution is not required by CC0, but the source and processing details are
preserved here for provenance. No television-broadcast audio is used.

## Crowd disappointment

`crowd-disappointment-cc0.mp3` is an edited web preview of **CRWDReac_Crowd
Sigh In Disappointment_ShaneVincent_GSC24_MSDEC-MKH435-Spirit.wav** uploaded by
ShangusBurger on Freesound:

- Source: https://freesound.org/people/ShangusBurger/sounds/764215/
- Preview used: https://cdn.freesound.org/previews/764/764215_11744683-hq.mp3
- License: Creative Commons 0 (CC0)
- Original recording: a medium-sized crowd deliberately sighing and groaning
  during the GameSoundCon 2024 Walla Recording Session; the session was
  recorded expressly for free CC0 publication

The local derivative starts at `00:01.18`, keeps 3.5 seconds, high-passes at 90
Hz, low-passes at 11 kHz, adds 17 dB of gain, and fades the tail. The shipped
MP3 is stereo, 48 kHz, 160 kbps, approximately `-19.4 LUFS`, and has SHA-256
`1d4bd97899159d62ee123d126146ca55a272ce54e7a0ff6014ff06fd8f799fb9`.
It is used for saves and goal-frame impacts; procedural impact layers provide
an immediate hit while the human reaction arrives just behind it.

## Light rain

`light-rain-cc0.mp3` is a normalized web preview of **Light Rain** by
soundrecorder7 on Freesound:

- Source: https://freesound.org/people/soundrecorder7/sounds/167034/
- License: Creative Commons 0 (CC0)
- Original description: a light-rain recording with no thunder or other
  background noises, intended to loop.

The local copy is normalized to roughly `-26 LUFS` before the application mixes
it very quietly beneath the stadium ambience. Attribution is not required by
CC0, but the source is preserved here for provenance.
