import { Howl } from 'howler'

const sounds = {
  tick: new Howl({ src: ['/tymer/tick.wav'], loop: false, }),
  periodEnd: new Howl({ src: ['/tymer/period-end.wav'], loop: false, }),
  timerEnd: new Howl({ src: ['/tymer/timer-end.wav'], loop: false, }),
  button: new Howl({ src: ['/tymer/button.wav'], loop: false, }),
}

export const playSound = (soundName) => {
  if (sounds[soundName]) sounds[soundName].play()
}
