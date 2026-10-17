/**
 * 「泡泡」动态大表情 —— the bubble mascot with little arms, a caption and a looping CSS animation.
 * Each sticker is a standalone 120×120 SVG; animations run even when shown through <img>.
 */
import { EXTRAS as X, INK, dropPath, faceMarkup, haloStroke, heartPath, shape, sparklePath, stroke } from './art.js';

// Only animated wrappers (the elements with a class) use their own box as the transform origin;
// applying fill-box globally would also shift every static transform="rotate(…)" in the artwork.
const BASE_CSS =
  '[class]{transform-box:fill-box}' +
  '.bob{animation:bob 1.6s ease-in-out infinite;transform-origin:50% 100%}' +
  '@keyframes bob{50%{transform:translateY(-3px)}}' +
  '@media (prefers-reduced-motion:reduce){*{animation:none!important}}';

/** A stubby mitten arm in face coordinates, filled with the face gradient. */
const arm = (cx, cy, rot, cls = '') =>
  `<g class="${cls}"><ellipse cx="${cx}" cy="${cy}" rx="5" ry="6.8" transform="rotate(${rot} ${cx} ${cy})" fill="url(#g)" stroke="${INK}" stroke-width="2.4"/></g>`;

const caption = (text, color = INK) =>
  `<text x="60" y="111" text-anchor="middle" font-family="'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC',sans-serif" font-size="17" font-weight="900" fill="${color}" stroke="#fff" stroke-width="5" stroke-linejoin="round" paint-order="stroke">${text}</text>`;

const heart = (x, y, s, cls) =>
  `<g class="${cls}">${shape(heartPath(x, y, s), '#ff4f6d', 1.6)}</g>`;

const sparkle = (x, y, r, cls, fill = '#ffc83d') => `<g class="${cls}">${shape(sparklePath(x, y, r), fill, 1.4)}</g>`;

function build({ id, name, text, face, armsBack = '', armsFront = '', back = '', front = '', css = '', body = 'bob', textColor, top = 6 }) {
  const svgText =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><style>${BASE_CSS}${css}</style>` +
    back +
    `<g class="${body}"><g transform="translate(23 ${top}) scale(1.15)">${armsBack}${faceMarkup(face)}${armsFront}</g></g>` +
    front +
    (text ? caption(text, textColor) : '') +
    '</svg>';
  return { id, name, text, svg: svgText };
}

export const STICKER_LIST = [
  build({
    id: 'hello',
    name: '你好呀',
    text: '你好呀',
    face: { eyes: 'happy', mouth: 'grin' },
    armsBack: arm(4.5, 44, 28) + arm(58, 16, -28, 'wave'),
    front: sparkle(104, 16, 5, 'tw'),
    css: '.wave{animation:wave .8s ease-in-out infinite;transform-origin:30% 95%}@keyframes wave{50%{transform:rotate(-30deg)}}' +
      '.tw{animation:tw 1.6s ease-in-out infinite;transform-origin:center}@keyframes tw{50%{transform:scale(.4);opacity:.3}}',
  }),
  build({
    id: 'roger',
    name: '收到',
    text: '收到！',
    face: { eyes: 'wink', mouth: 'smile', brows: 'firm' },
    armsBack: arm(4.5, 44, 28),
    armsFront: arm(52, 15, 62),
    body: 'nod',
    css: '.nod{animation:nod 1.4s ease-in-out infinite;transform-origin:50% 90%}@keyframes nod{0%,60%,100%{transform:rotate(0)}20%{transform:rotate(-7deg)}40%{transform:rotate(3deg)}}',
  }),
  build({
    id: 'haha',
    name: '哈哈哈',
    text: '哈哈哈哈',
    face: { eyes: 'squint', mouth: 'laugh', over: [X.tearsJoy()] },
    armsFront: arm(18, 54, 70) + arm(46, 54, -70),
    body: 'shake',
    css: '.shake{animation:shake .32s linear infinite;transform-origin:50% 100%}@keyframes shake{25%{transform:rotate(-5deg)}75%{transform:rotate(5deg)}}',
  }),
  build({
    id: 'night',
    name: '晚安',
    text: '晚安',
    textColor: '#5b4fd6',
    face: { eyes: 'closed', mouth: 'small', over: [`<g class="snot">${X.snot()}</g>`] },
    armsBack: arm(4.5, 44, 28) + arm(59.5, 44, -28),
    back:
      shape('M24 6A13 13 0 1 0 36 26A10.5 10.5 0 1 1 24 6Z', '#ffe27a', 1.8) +
      sparkle(40, 10, 3.4, 'tw', '#ffe27a'),
    front:
      `<g class="z z1">${haloStroke('M92 30h6l-6 7h6', '#7a6cff', 2.4)}</g>` +
      `<g class="z z2">${haloStroke('M100 16h7.6l-7.6 8.6h7.6', '#7a6cff', 2.6)}</g>`,
    body: 'breathe',
    css: '.breathe{animation:breathe 2.6s ease-in-out infinite;transform-origin:50% 100%}@keyframes breathe{50%{transform:scale(1.03,.97)}}' +
      '.snot{animation:snot 2.6s ease-in-out infinite;transform-origin:30% 30%}@keyframes snot{50%{transform:scale(1.45)}}' +
      '.z{animation:z 2.6s ease-in infinite;opacity:0}.z2{animation-delay:1.3s}@keyframes z{0%{opacity:0;transform:translate(0,6px)}30%{opacity:1}100%{opacity:0;transform:translate(6px,-12px)}}' +
      '.tw{animation:tw 2s ease-in-out infinite;transform-origin:center}@keyframes tw{50%{transform:scale(.4);opacity:.3}}',
  }),
  build({
    id: 'love',
    name: '爱你',
    text: '爱你哟',
    textColor: '#e8365a',
    face: { eyes: 'heart', mouth: 'grin', cheeks: 'strong' },
    armsBack: arm(3, 30, 40) + arm(61, 30, -40),
    front: heart(18, 34, 0.9, 'up u1') + heart(100, 28, 1.1, 'up u2') + heart(92, 54, 0.7, 'up u3'),
    css: '.up{animation:up 2.1s ease-out infinite;opacity:0;transform-origin:center}.u2{animation-delay:.7s}.u3{animation-delay:1.4s}' +
      '@keyframes up{0%{opacity:0;transform:translateY(8px) scale(.5)}25%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-22px) scale(1.1)}}',
  }),
  build({
    id: 'sad',
    name: '委屈',
    text: '委屈巴巴',
    face: { eyes: 'teary', brows: 'sad', mouth: 'wobble' },
    armsFront: arm(20, 52, 60) + arm(44, 52, -60),
    front: `<g class="fall f1">${shape(dropPath(42, 44, 0.9), '#8ad8ff', 1.4)}</g><g class="fall f2">${shape(dropPath(77, 44, 0.9), '#8ad8ff', 1.4)}</g>`,
    body: 'tremble',
    css: '.tremble{animation:tremble 1.8s ease-in-out infinite;transform-origin:50% 100%}@keyframes tremble{0%,50%,100%{transform:translateX(0)}10%,30%{transform:translateX(-1.2px)}20%,40%{transform:translateX(1.2px)}}' +
      '.fall{animation:fall 1.4s ease-in infinite;opacity:0}.f2{animation-delay:.7s}@keyframes fall{0%{opacity:0;transform:translateY(0)}15%{opacity:1}100%{opacity:0;transform:translateY(26px)}}',
  }),
  build({
    id: 'go',
    name: '冲鸭',
    text: '冲鸭！',
    textColor: '#e5482f',
    face: { eyes: 'dot', brows: 'firm', mouth: 'grin', inner: [X.headband()], over: [X.headbandKnot()] },
    armsBack: arm(3, 44, 50),
    armsFront: arm(60, 40, -70, 'punch'),
    back: `<g class="speed">${stroke('M4 38H20M2 52H16M6 66H22', 2.6, '#9aa3b5')}</g>`,
    body: 'dash',
    css: '.dash{animation:dash .7s ease-in-out infinite}@keyframes dash{50%{transform:translateX(5px) rotate(4deg)}}' +
      '.speed{animation:speed .35s linear infinite}@keyframes speed{0%{transform:translateX(6px);opacity:1}100%{transform:translateX(-8px);opacity:.2}}' +
      '.punch{animation:punch .7s ease-in-out infinite;transform-origin:0% 50%}@keyframes punch{50%{transform:translateX(3px)}}',
  }),
  build({
    id: 'fish',
    name: '摸鱼',
    text: '摸鱼中…',
    textColor: '#2f86d6',
    face: { eyes: 'half', mouth: 'smile' },
    armsBack: arm(4.5, 44, 28) + arm(59.5, 44, -28),
    front:
      `<g class="swim"><g transform="translate(66 64)">` +
      shape('M0 8Q10 -2 22 8Q10 18 0 8Z', '#ff9a3d', 1.8) +
      shape('M21 8L30 1.6V14.4Z', '#ff9a3d', 1.8) +
      `<circle cx="6.5" cy="6.6" r="1.6" fill="${INK}"/>` +
      stroke('M13 4.6Q15.6 8 13 11.4', 1.4) +
      `</g></g>` +
      `<g class="bub b1"><circle cx="64" cy="60" r="2.6" fill="#c9efff" stroke="${INK}" stroke-width="1.2"/></g>` +
      `<g class="bub b2"><circle cx="60" cy="62" r="1.8" fill="#c9efff" stroke="${INK}" stroke-width="1.2"/></g>`,
    body: 'sway',
    css: '.sway{animation:sway 3s ease-in-out infinite;transform-origin:50% 100%}@keyframes sway{25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}' +
      '.swim{animation:swim 3s ease-in-out infinite}@keyframes swim{50%{transform:translate(-50px,4px)}}' +
      '.bub{animation:bub 2s ease-out infinite;opacity:0}.b2{animation-delay:1s}@keyframes bub{0%{opacity:0;transform:translate(0,0)}20%{opacity:1}100%{opacity:0;transform:translate(-6px,-30px)}}',
  }),
  build({
    id: 'yay',
    name: '好耶',
    text: '好耶！',
    textColor: '#e88b00',
    face: { eyes: 'star', mouth: 'laugh' },
    armsBack: arm(2, 22, 30) + arm(62, 22, -30),
    front: sparkle(14, 20, 6, 'tw t1') + sparkle(106, 30, 5, 'tw t2') + sparkle(100, 76, 4, 'tw t3'),
    body: 'jump',
    top: 12,
    css: '.jump{animation:jump .9s cubic-bezier(.3,.8,.4,1) infinite;transform-origin:50% 100%}@keyframes jump{0%,100%{transform:translateY(0) scale(1.06,.94)}15%{transform:translateY(0) scale(1)}50%{transform:translateY(-9px)}85%{transform:translateY(0) scale(1)}}' +
      '.tw{animation:tw 1s ease-in-out infinite;transform-origin:center}.t2{animation-delay:.33s}.t3{animation-delay:.66s}@keyframes tw{50%{transform:scale(.3) rotate(45deg);opacity:.3}}',
  }),
  build({
    id: 'hmph',
    name: '哼',
    text: '哼！',
    textColor: '#e5482f',
    face: { tone: 'angry', eyes: 'half', brows: 'angry', mouth: 'frown', cheeks: false, over: [`<g class="pulse">${X.anger()}</g>`] },
    armsFront: arm(16, 46, 80) + arm(48, 46, -80),
    body: 'stomp',
    css: '.stomp{animation:stomp .5s ease-in-out infinite;transform-origin:50% 100%}@keyframes stomp{50%{transform:translateY(-2px) rotate(-3deg)}}' +
      '.pulse{animation:pulse .5s ease-in-out infinite;transform-origin:center}@keyframes pulse{50%{transform:scale(1.35)}}',
  }),
  build({
    id: 'thanks',
    name: '谢谢老板',
    text: '谢谢老板',
    textColor: '#d92128',
    face: { eyes: 'happy', mouth: 'smile', cheeks: 'strong' },
    armsBack: arm(4.5, 44, 28),
    armsFront:
      `<g transform="translate(46 38) rotate(12)">` +
      `<rect x="0" y="0" width="14" height="18" rx="2.4" fill="#f2343a" stroke="${INK}" stroke-width="1.8"/>` +
      shape('M0 6Q7 10.5 14 6V2.4Q14 0 11.6 0H2.4Q0 0 0 2.4Z', '#d92128', 1.8) +
      `<circle cx="7" cy="8.6" r="2.4" fill="#ffd34d" stroke="${INK}" stroke-width="1.2"/></g>` +
      arm(56, 50, -50),
    body: 'bow',
    css: '.bow{animation:bow 1.6s ease-in-out infinite;transform-origin:50% 100%}@keyframes bow{0%,100%{transform:rotate(0)}40%,60%{transform:rotate(12deg) translateY(2px)}}',
  }),
  build({
    id: 'anyone',
    name: '在吗',
    text: '在吗？',
    face: { eyes: 'big', mouth: 'o' },
    armsBack: arm(4, 34, 20) + arm(60, 34, -20),
    back: '',
    front:
      `<g class="ask">${haloStroke('M93 20Q93 13 100 13Q107 13 107 19Q107 23 101 25V28.6', '#3d7bff', 3)}<circle cx="101" cy="34" r="2.3" fill="#3d7bff" stroke="#fff" stroke-width="1.4"/></g>`,
    body: 'peek',
    css: '.peek{animation:peek 2.4s ease-in-out infinite}@keyframes peek{0%,100%{transform:translateY(16px)}35%,70%{transform:translateY(0)}}' +
      '.ask{animation:ask 2.4s ease-in-out infinite;transform-origin:50% 100%}@keyframes ask{0%,30%,100%{transform:scale(0);opacity:0}40%,70%{transform:scale(1);opacity:1}}',
  }),
  build({
    id: 'melon',
    name: '吃瓜',
    text: '吃瓜群众',
    textColor: '#2f9e4f',
    face: { eyes: 'side', mouth: 'none', over: [`<g class="munch">${X.melon()}</g>`] },
    armsFront: arm(16, 50, 60) + arm(48, 50, -60),
    body: 'bob',
    css: '.munch{animation:munch .6s ease-in-out infinite;transform-origin:50% 0%}@keyframes munch{50%{transform:translateY(-2.5px) rotate(-3deg)}}',
  }),
  build({
    id: 'what',
    name: '疑惑',
    text: '？？？',
    textColor: '#3d7bff',
    face: { eyes: 'dot', brows: 'raised', mouth: 'flat' },
    armsBack: arm(4.5, 44, 28) + arm(59.5, 44, -28),
    front:
      ['q1', 'q2', 'q3']
        .map(
          (cls, i) =>
            `<g class="q ${cls}">${haloStroke(`M${18 + i * 34} ${16 - (i % 2) * 6}q0 -6 6 -6q6 0 6 5q0 3.4 -5 5v3`, '#3d7bff', 2.6)}<circle cx="${24 + i * 34 - 1}" cy="${27.6 - (i % 2) * 6}" r="1.9" fill="#3d7bff" stroke="#fff" stroke-width="1.2"/></g>`,
        )
        .join(''),
    body: 'tilt',
    css: '.tilt{animation:tilt 2.4s ease-in-out infinite;transform-origin:50% 100%}@keyframes tilt{0%,100%{transform:rotate(0)}50%{transform:rotate(-8deg)}}' +
      '.q{animation:q 2.4s ease-out infinite;opacity:0;transform-origin:50% 100%}.q2{animation-delay:.3s}.q3{animation-delay:.6s}@keyframes q{0%{opacity:0;transform:scale(.2)}15%,70%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1)}}',
  }),
];
