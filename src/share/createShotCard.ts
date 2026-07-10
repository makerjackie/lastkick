import {SHOT_STYLES, roundRank, type Language} from '../experience/copy';
import type {ImpactKind, ShotRecord, ShotStyle} from '../experience/store';

type ShotCardInput = {
  source: HTMLCanvasElement;
  impactKind: ImpactKind;
  shotStyle: ShotStyle;
  charge: number;
  attempt: number;
  keeperSaves: number;
  goals: number;
  roundShots: ShotRecord[];
  language: Language;
};

const WIDTH = 1080;
const HEIGHT = 1920;

const resultCopy: Record<Language, Record<ImpactKind, {kicker: string; title: string; detail: string}>> = {
  zh: {
    goal: {kicker: 'GOAL', title: '这次，墙裂了。', detail: '我骗过了佛得角门神 Vozinha'},
    save: {kicker: 'SAVE', title: '他又猜到了。', detail: '下一脚，换边或者换一种射法'},
    post: {kicker: 'POST', title: '门柱也是他们的人。', detail: '瞄准点往里收一点'},
    bar: {kicker: 'CROSSBAR', title: '横梁：此路不通。', detail: '少向上拖，或者提前松手'}
  },
  en: {
    goal: {kicker: 'GOAL', title: 'THE WALL CRACKED.', detail: 'I beat Cabo Verde keeper Vozinha'},
    save: {kicker: 'SAVE', title: 'HE READ IT AGAIN.', detail: 'Switch side or switch shot on the next kick'},
    post: {kicker: 'POST', title: 'THE POST TOOK HIS SIDE.', detail: 'Aim a little further inside'},
    bar: {kicker: 'CROSSBAR', title: 'ACCESS DENIED.', detail: 'Drag less upward or release earlier'}
  }
};

function coverSource(context: CanvasRenderingContext2D, source: HTMLCanvasElement) {
  const sourceRatio = source.width / source.height;
  const outputRatio = WIDTH / HEIGHT;
  let sx = 0;
  let sy = 0;
  let sw = source.width;
  let sh = source.height;

  if (sourceRatio > outputRatio) {
    sw = source.height * outputRatio;
    sx = (source.width - sw) / 2;
  } else {
    sh = source.width / outputRatio;
    sy = (source.height - sh) / 2;
  }
  context.drawImage(source, sx, sy, sw, sh, 0, 0, WIDTH, HEIGHT);
}

function setFittedFont(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxSize: number,
  minSize: number,
  family: string,
  weight = 540
) {
  let size = maxSize;
  do {
    context.font = `${weight} ${size}px ${family}`;
    size -= 2;
  } while (size >= minSize && context.measureText(text).width > maxWidth);
}

function outcomeLabel(kind: ImpactKind) {
  if (kind === 'goal') return 'GOAL';
  if (kind === 'save') return 'SAVE';
  if (kind === 'post') return 'POST';
  return 'BAR';
}

export async function createShotCard(input: ShotCardInput): Promise<Blob> {
  await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');

  context.fillStyle = '#03090d';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  coverSource(context, input.source);

  const topShade = context.createLinearGradient(0, 0, 0, 540);
  topShade.addColorStop(0, 'rgba(3, 9, 13, 0.94)');
  topShade.addColorStop(1, 'rgba(3, 9, 13, 0)');
  context.fillStyle = topShade;
  context.fillRect(0, 0, WIDTH, 560);

  const bottomShade = context.createLinearGradient(0, 760, 0, HEIGHT);
  bottomShade.addColorStop(0, 'rgba(3, 9, 13, 0)');
  bottomShade.addColorStop(0.28, 'rgba(3, 9, 13, 0.48)');
  bottomShade.addColorStop(0.65, 'rgba(3, 9, 13, 0.9)');
  bottomShade.addColorStop(1, 'rgba(3, 9, 13, 0.99)');
  context.fillStyle = bottomShade;
  context.fillRect(0, 700, WIDTH, HEIGHT - 700);

  context.fillStyle = '#ff513d';
  context.fillRect(64, 64, 276, 64);
  context.fillStyle = '#061118';
  context.font = '600 31px "IBM Plex Mono", monospace';
  context.textBaseline = 'middle';
  context.fillText('CABO VERDE', 84, 97);

  context.textAlign = 'right';
  context.fillStyle = '#46d7c7';
  context.font = '600 28px "IBM Plex Mono", monospace';
  context.fillText(`VOZINHA · ${input.keeperSaves} SAVES`, WIDTH - 64, 96);

  const complete = input.roundShots.length >= 3;
  const selectedCopy = complete
    ? roundRank(input.goals, input.language)
    : resultCopy[input.language][input.impactKind];
  const secondLanguage: Language = input.language === 'zh' ? 'en' : 'zh';
  const secondCopy = complete
    ? roundRank(input.goals, secondLanguage)
    : resultCopy[secondLanguage][input.impactKind];

  context.textAlign = 'left';
  context.fillStyle = input.goals > 0 ? '#ff513d' : '#46d7c7';
  context.font = '600 30px "IBM Plex Mono", monospace';
  context.fillText(complete ? '3 SHOTS · ONE WALL' : resultCopy[input.language][input.impactKind].kicker, 64, 1332);

  context.fillStyle = '#f2edd8';
  context.textBaseline = 'alphabetic';
  setFittedFont(
    context,
    selectedCopy.title,
    WIDTH - 128,
    116,
    70,
    '"Teko Variable", "PingFang SC", sans-serif'
  );
  context.fillText(selectedCopy.title, 64, 1468, WIDTH - 128);

  context.fillStyle = 'rgba(242, 237, 216, 0.76)';
  setFittedFont(
    context,
    secondCopy.title,
    WIDTH - 136,
    43,
    30,
    '"IBM Plex Mono", "PingFang SC", monospace',
    400
  );
  context.fillText(secondCopy.title, 68, 1532, WIDTH - 136);

  context.fillStyle = '#d7a84f';
  context.font = '600 25px "IBM Plex Mono", monospace';
  const activeStyle = SHOT_STYLES.find((style) => style.id === input.shotStyle) ?? SHOT_STYLES[0];
  context.fillText(
    complete
      ? `${input.goals} GOAL${input.goals === 1 ? '' : 'S'} IN 3 KICKS · ${input.keeperSaves} SAVES`
      : `KICK ${String(input.attempt).padStart(2, '0')} · ${activeStyle.code} · ${Math.round(input.charge * 100)}% POWER`,
    68,
    1600,
    WIDTH - 136
  );

  const visibleShots = input.roundShots.slice(0, 3);
  visibleShots.forEach((shot, index) => {
    const x = 64 + index * 318;
    const color = shot.impactKind === 'goal' ? '#ff513d' : shot.impactKind === 'save' ? '#46d7c7' : '#d7a84f';
    context.fillStyle = 'rgba(3, 9, 13, 0.72)';
    context.fillRect(x, 1650, 292, 76);
    context.strokeStyle = color;
    context.lineWidth = 3;
    context.strokeRect(x, 1650, 292, 76);
    context.fillStyle = color;
    context.font = '600 23px "IBM Plex Mono", monospace';
    context.fillText(`0${index + 1}`, x + 18, 1697);
    context.fillStyle = '#f2edd8';
    context.font = '600 25px "IBM Plex Mono", monospace';
    context.fillText(outcomeLabel(shot.impactKind), x + 74, 1697);
  });

  context.strokeStyle = 'rgba(242, 237, 216, 0.28)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(64, 1782);
  context.lineTo(WIDTH - 64, 1782);
  context.stroke();

  context.fillStyle = '#f2edd8';
  context.font = '600 27px "IBM Plex Mono", monospace';
  context.fillText('CAN YOU BEAT THE WALL?', 64, 1840);
  context.textAlign = 'right';
  context.fillStyle = 'rgba(242, 237, 216, 0.58)';
  context.fillText('lastkick.01mvp.com', WIDTH - 64, 1840);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Shot card encoding failed'))),
      'image/png'
    );
  });
}
