import type {ImpactKind, Phase, ShotRecord, ShotStyle} from './store';

export type Language = 'zh' | 'en';

export const SHOT_STYLES: Array<{
  id: ShotStyle;
  mark: string;
  code: string;
  label: Record<Language, string>;
  hint: Record<Language, string>;
}> = [
  {
    id: 'power',
    mark: '↗',
    code: 'POWER',
    label: {zh: '爆射', en: 'POWER'},
    hint: {zh: '64% 以上 · 压向左或右下角', en: '64%+ · DRIVE TO A LOW CORNER'}
  },
  {
    id: 'curve',
    mark: '⌁',
    code: 'BEND',
    label: {zh: '弧线', en: 'CURVE'},
    hint: {zh: '拉向远角 · 看它兜回来', en: 'AIM WIDE · LET IT BEND BACK'}
  },
  {
    id: 'chip',
    mark: '⌒',
    code: 'CHIP',
    label: {zh: '勺子', en: 'CHIP'},
    hint: {zh: '45–80% 力量 · 瞄准中路', en: '45–80% POWER · AIM CENTRE'}
  }
];

export const UI = {
  zh: {
    ariaGame: '最后一脚，三脚挑战 Vozinha',
    soundOn: '声音开',
    soundOff: '声音关',
    mute: '关闭声音',
    unmute: '开启声音',
    help: '玩法',
    introKicker: 'WORLD CUP · 120:00 · 生死球',
    introTitle: '最后三脚',
    introLead: 'Vozinha 已经挡住 8 次。现在，他只看你的脚。',
    introShots: '3 次机会',
    introMemory: '他会记住',
    introWall: '只有一堵墙',
    introStart: '走上点球点',
    introSound: '声音将开启 · 建议戴上耳机',
    roundRule: '三脚挑战',
    scoreOnce: '门将会记住上一脚',
    selectShot: '选择射法',
    keys: '按 1 / 2 / 3',
    hold: '按住足球',
    drag: '拖向发光的球门一角',
    release: '松手射门',
    chargeSweet: '甜区锁定 · 松手！',
    chargeLow: '力量不够 · 再蓄一点',
    chargeOver: '力量过头 · 这脚会飞',
    aimWindow: '把准星送进发光区',
    nextKick: '下一脚',
    changeIt: '换一招',
    scoreAgain: '再进一个',
    restart: '再战三脚',
    preview: '预览挑战卡',
    generating: '生成挑战卡…',
    kick: '第',
    kickSuffix: '脚',
    goal: '进球',
    save: '扑出',
    post: '门柱',
    bar: '横梁',
    helpTitle: '三脚，骗过一位会学习的门将。',
    helpLead: 'Vozinha 会记住上一脚的方向和射法。重复同一招，他一定扑到。',
    helpSteps: ['选择爆射、弧线或勺子', '按住足球蓄力，拖向球门', '松手射门；下一脚记得换边或换招'],
    close: '明白了',
    shareTitle: '这就是你要分享的挑战卡',
    shareLead: '先看清结果，再决定保存或打开 iPhone 分享。',
    saveImage: '保存图片',
    shareImage: '分享这张图',
    longPress: '在手机上也可以长按图片保存',
    closePreview: '关闭预览',
    shared: '已打开系统分享',
    downloaded: '挑战卡已保存',
    copied: '挑战文案与链接已复制',
    shareFailed: '分享未完成，可以长按图片保存',
    cardFailed: '挑战卡生成失败，请重试',
    caseKicker: 'POST-MATCH · GPT-5.6 BUILD LOG',
    caseTitle: '一条提示词，做不出这个游戏。',
    caseLead: '完整公开提示词、失败版本、难度曲线、视觉与上线复盘。',
    casePrimary: '查看完整提示词与制作复盘',
    community: '加入 01MVP 交流群',
    caseReplay: '再战三脚',
    caseDismiss: '关闭制作复盘推荐',
    groupKicker: '01MVP · BUILD IN PUBLIC',
    groupTitle: '一起用 AI，把想法做出来。',
    groupLead: '扫码加入 01MVP 交流群，交流 ChatGPT 使用体验、AI Coding 和真实产品实践。',
    groupQrAlt: '01MVP 交流群二维码',
    groupDirect: '二维码未显示？直接打开图片',
    groupClose: '返回比赛',
    factualLine: 'VOZINHA · 40 · 8 SAVES VS ARGENTINA',
    lastKickFact: '阿根廷也踢到 120 分钟。你还有一脚。'
  },
  en: {
    ariaGame: 'The Last Kick, three-shot challenge against Vozinha',
    soundOn: 'SOUND ON',
    soundOff: 'SOUND OFF',
    mute: 'Mute sound',
    unmute: 'Turn sound on',
    help: 'HOW TO',
    introKicker: 'WORLD CUP · 120:00 · SUDDEN DEATH',
    introTitle: 'THE LAST THREE',
    introLead: 'Vozinha has already stopped eight. Now he is watching your foot.',
    introShots: '3 CHANCES',
    introMemory: 'HE REMEMBERS',
    introWall: 'ONE WALL',
    introStart: 'STEP UP',
    introSound: 'SOUND ON · HEADPHONES RECOMMENDED',
    roundRule: '3-SHOT CHALLENGE',
    scoreOnce: 'THE KEEPER REMEMBERS YOUR LAST SHOT',
    selectShot: 'PICK A SHOT',
    keys: 'PRESS 1 / 2 / 3',
    hold: 'HOLD THE BALL',
    drag: 'DRAG TO A GLOWING CORNER',
    release: 'RELEASE TO SHOOT',
    chargeSweet: 'WINDOW LOCKED · RELEASE!',
    chargeLow: 'MORE POWER · KEEP HOLDING',
    chargeOver: 'TOO MUCH · THIS WILL FLY',
    aimWindow: 'MOVE THE RETICLE INTO THE GLOW',
    nextKick: 'NEXT KICK',
    changeIt: 'CHANGE IT',
    scoreAgain: 'SCORE AGAIN',
    restart: 'PLAY 3 MORE',
    preview: 'PREVIEW CHALLENGE CARD',
    generating: 'BUILDING YOUR CARD…',
    kick: 'KICK',
    kickSuffix: '',
    goal: 'GOAL',
    save: 'SAVE',
    post: 'POST',
    bar: 'BAR',
    helpTitle: 'Three kicks against a keeper who learns.',
    helpLead: 'Vozinha remembers the direction and style of your last kick. Repeat the plan and he will stop it.',
    helpSteps: ['Pick Power, Curve, or Chip', 'Hold the ball, build power, and drag toward goal', 'Release to shoot; then switch side or style'],
    close: 'GOT IT',
    shareTitle: 'This is the exact card you will share',
    shareLead: 'See the result first, then save it or open the iPhone share sheet.',
    saveImage: 'SAVE IMAGE',
    shareImage: 'SHARE THIS CARD',
    longPress: 'On mobile, you can also long-press the card to save it',
    closePreview: 'CLOSE PREVIEW',
    shared: 'System share opened',
    downloaded: 'Challenge card saved',
    copied: 'Challenge copy and link copied',
    shareFailed: 'Share did not finish — long-press the image to save it',
    cardFailed: 'Could not build the card. Please retry.',
    caseKicker: 'POST-MATCH · GPT-5.6 BUILD LOG',
    caseTitle: "ONE PROMPT DIDN'T BUILD THIS.",
    caseLead: 'See every prompt, failed version, difficulty curve, visual decision, and deployment lesson.',
    casePrimary: 'READ THE FULL PROMPT & BUILD LOG',
    community: 'JOIN THE 01MVP COMMUNITY',
    caseReplay: 'PLAY 3 MORE',
    caseDismiss: 'Dismiss the build story',
    groupKicker: '01MVP · BUILD IN PUBLIC',
    groupTitle: 'BUILD YOUR IDEA WITH AI.',
    groupLead: 'Scan to join the 01MVP community for ChatGPT field notes, AI coding, and honest product practice.',
    groupQrAlt: 'QR code for the 01MVP community',
    groupDirect: 'QR not showing? Open the image directly',
    groupClose: 'BACK TO THE MATCH',
    factualLine: 'VOZINHA · 40 · 8 SAVES VS ARGENTINA',
    lastKickFact: 'Argentina needed 120 minutes. You still have one kick.'
  }
} as const;

export type MomentCopy = {
  title: string;
  detail: string;
  tip?: string;
};

export function roundRank(goals: number, language: Language): MomentCopy {
  const zh: Record<number, MomentCopy> = {
    0: {title: '门神还是门神。', detail: '三脚，全被挡住。', tip: '敢不敢把这张零封卡发出去？'},
    1: {title: '墙裂了一条缝。', detail: '三脚进 1 个。', tip: '把挑战卡发给下一个人。'},
    2: {title: '你把墙拆了。', detail: '三脚进 2 个。', tip: 'Vozinha 要开始研究你了。'},
    3: {title: '建议赛后查球。', detail: '三脚全进。', tip: '这张卡，不发没人信。'}
  };
  const en: Record<number, MomentCopy> = {
    0: {title: 'THE WALL STOOD.', detail: 'Stopped 3 out of 3.', tip: 'Brave enough to share the clean sheet?'},
    1: {title: 'YOU CRACKED THE WALL.', detail: '1 goal in 3 kicks.', tip: 'Send the card to the next challenger.'},
    2: {title: 'YOU BROKE THE WALL.', detail: '2 goals in 3 kicks.', tip: 'Vozinha is studying you now.'},
    3: {title: 'CHECK THE BALL.', detail: '3 goals in 3 kicks.', tip: 'Share it. Nobody will believe you.'}
  };
  return (language === 'zh' ? zh : en)[Math.max(0, Math.min(3, goals))];
}

function resultCopy(record: ShotRecord, language: Language): MomentCopy {
  if (language === 'zh') {
    if (record.impactKind === 'goal') {
      if (record.shotStyle === 'curve') return {title: '物理老师退出了直播间。', detail: '弧线绕过了四十年的经验。', tip: '进了也别重复：他已经记住。'};
      if (record.shotStyle === 'chip') return {title: '你真敢勺。', detail: '他先动了，你没有。', tip: '下一脚换边，别让他读懂。'};
      return {title: '这球，得查网速。', detail: '爆射撕开了佛得角的墙。', tip: '下一脚别走同一侧。'};
    }
    if (record.impactKind === 'post') return {title: '门柱正式加入佛得角。', detail: '当——全场都听见了。', tip: '瞄准点往里收一点。'};
    if (record.impactKind === 'bar') return {title: '横梁：此路不通。', detail: '高了一点，也狠了一点。', tip: '少向上拖，或提前松手。'};
    if (record.planRepeated) return {title: '他已读你的脚法。', detail: '同一侧、同一射法，他全记得。', tip: '至少换边或换一种射法。'};
    if (record.reason === 'power-too-soft') return {title: '他甚至没有倒地。', detail: '方向对了，球速骗不了他。', tip: '继续按到 64% 以上再松手。'};
    if (record.reason === 'power-not-low-corner') return {title: '中路是他的。', detail: '手套、低吼、全场一声 OH。', tip: '爆射要压向发光的左或右下角。'};
    if (record.reason === 'curve-too-soft') return {title: '弧线有了，杀气没有。', detail: '他站着等球转过来。', tip: '瞄准远角，力量至少过 52%。'};
    if (record.reason === 'curve-not-wide-corner') return {title: '弧线没绕开他。', detail: '他提前走到了终点。', tip: '把准星拉进左右上角的发光弧线。'};
    if (record.reason === 'chip-too-soft') return {title: '这不是勺子，是喂球。', detail: '他向前一步，轻松抱住。', tip: '中路不变，把力量提到 45% 以上。'};
    if (record.reason === 'chip-too-hard') return {title: '勺子变成了锅铲。', detail: '他没吃晃，反而等到了球。', tip: '中路保留，在 80% 前松手。'};
    return {title: '你勺了，但他没吃。', detail: '这口经验太老练。', tip: '用 45–80% 力量，把准星放在中路发光区。'};
  }

  if (record.impactKind === 'goal') {
    if (record.shotStyle === 'curve') return {title: 'PHYSICS LEFT THE CHAT.', detail: 'The bend beat forty years of experience.', tip: 'Do not repeat it. He remembers.'};
    if (record.shotStyle === 'chip') return {title: 'YOU ACTUALLY CHIPPED HIM.', detail: 'He moved first. You did not.', tip: 'Switch sides on the next kick.'};
    return {title: 'CHECK THE NET SPEED.', detail: 'Power cracked the Cabo Verde wall.', tip: 'Do not use the same side again.'};
  }
  if (record.impactKind === 'post') return {title: 'THE POST JOINED CABO VERDE.', detail: 'CLANG — the whole stadium heard it.', tip: 'Aim a little further inside.'};
  if (record.impactKind === 'bar') return {title: 'CROSSBAR: ACCESS DENIED.', detail: 'A little too high. A little too hard.', tip: 'Drag less upward or release earlier.'};
  if (record.planRepeated) return {title: 'HE READ YOUR FOOT.', detail: 'Same side, same shot. He remembered both.', tip: 'Change at least the side or the style.'};
  if (record.reason === 'power-too-soft') return {title: 'HE DIDN’T EVEN HAVE TO DIVE.', detail: 'The corner was right. The speed was not.', tip: 'Hold beyond 64%, then release.'};
  if (record.reason === 'power-not-low-corner') return {title: 'THE MIDDLE IS HIS.', detail: 'Gloves, impact, then one giant OH.', tip: 'Drive the ball into a glowing low corner.'};
  if (record.reason === 'curve-too-soft') return {title: 'BEND, NO BITE.', detail: 'He stood still and waited for it.', tip: 'Aim wide and build at least 52% power.'};
  if (record.reason === 'curve-not-wide-corner') return {title: 'THE BEND NEVER BEAT HIM.', detail: 'He arrived before the ball did.', tip: 'Put the reticle into a glowing upper-corner arc.'};
  if (record.reason === 'chip-too-soft') return {title: 'THAT WAS A GIFT.', detail: 'One step forward. An easy catch.', tip: 'Stay central and build beyond 45% power.'};
  if (record.reason === 'chip-too-hard') return {title: 'THE SPOON BECAME A SHOVEL.', detail: 'He waited underneath it.', tip: 'Stay central and release before 80%.'};
  return {title: 'YOU CHIPPED. HE DIDN’T BITE.', detail: 'Forty years of patience.', tip: 'Use 45–80% power and stay inside the central glow.'};
}

export function momentCopy(input: {
  phase: Phase;
  impactKind: ImpactKind;
  shotStyle: ShotStyle;
  roundShots: ShotRecord[];
  goals: number;
  language: Language;
}): MomentCopy {
  const {phase, roundShots, goals, language} = input;
  const hasMemory = roundShots.length > 0;
  const finalRound = phase === 'aftermath' && roundShots.length >= 3;
  if (finalRound) return roundRank(goals, language);

  if (phase === 'ready') {
    if (hasMemory) {
      return language === 'zh'
        ? {title: '他记得上一脚。', detail: '换边，或者换一种射法。'}
        : {title: 'HE REMEMBERS.', detail: 'Change side or change shot.'};
    }
    return language === 'zh'
      ? {title: '三脚，过这堵墙。', detail: '你面对的是会学习的 Vozinha。'}
      : {title: 'THREE KICKS. BEAT THE WALL.', detail: 'You are facing a Vozinha who learns.'};
  }
  if (phase === 'charging') {
    return language === 'zh'
      ? {title: '他在读你的脚。', detail: '拖动瞄准，松手给答案。'}
      : {title: 'HE IS READING YOUR FOOT.', detail: 'Drag to aim. Release your answer.'};
  }
  if (phase === 'contact') return language === 'zh' ? {title: '就是现在', detail: ''} : {title: 'NOW', detail: ''};
  if (phase === 'flight') return language === 'zh' ? {title: '别眨眼', detail: ''} : {title: "DON'T BLINK", detail: ''};
  if (phase === 'impact') {
    if (input.impactKind === 'goal') return {title: 'GOAL!', detail: ''};
    if (input.impactKind === 'save') return {title: 'SAVE!', detail: ''};
    if (input.impactKind === 'post') return {title: 'CLANG!', detail: ''};
    return {title: 'BANG!', detail: ''};
  }

  const record = roundShots.at(-1);
  return record ? resultCopy(record, language) : {title: '', detail: ''};
}

export function impactLabel(kind: ImpactKind, language: Language) {
  return UI[language][kind];
}
