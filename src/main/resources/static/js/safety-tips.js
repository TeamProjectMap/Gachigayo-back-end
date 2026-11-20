/*
 * 이용자 홈 '이렇게 해요' 배너: 교통안전 문구를 12초마다 무작위로 바꿔 보여준다.
 *
 * 그림은 모두 이 파일에서 직접 그린 단순한 SVG라 저작권 걱정이 없다.
 * 문구 하나에 그림 하나: 글을 읽기 어려워도 그림으로 바로 알 수 있게.
 */
(function () {
    "use strict";

    var INTERVAL_MS = 12000;

    // 색: 같이가요 초록, 신호 빨강·초록, 버스 파랑, 지하철 보라 (길안내 막대와 같은 색)
    var G = "#018B38", R = "#E5484D", B = "#2878EF", P = "#8555D9", Y = "#F5B400", D = "#363636", L = "#C8C8C8";

    function svg(body) {
        return '<svg viewBox="0 0 48 48" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + "</svg>";
    }

    // 걷는 사람 (여러 그림에서 같이 쓴다)
    function walker(x, y, color) {
        return '<g transform="translate(' + x + " " + y + ')" stroke="' + (color || D) + '" stroke-width="2.4">'
                + '<circle cx="0" cy="-11" r="2.6" fill="' + (color || D) + '" stroke="none"/>'
                + '<path d="M0 -7 L-1 2 M-1 2 L-5 10 M-1 2 L3 10 M0 -5 L-5 -1 M0 -5 L5 -2"/></g>';
    }

    // 신호등 (lit: red | green | blink)
    function signal(lit) {
        return '<rect x="17" y="6" width="14" height="30" rx="5" fill="' + D + '"/>'
                + '<circle cx="24" cy="14" r="4.2" fill="' + (lit === "red" ? R : "#5A5A5A") + '"/>'
                + '<circle cx="24" cy="28" r="4.2" fill="' + (lit === "red" ? "#5A5A5A" : G) + '"/>'
                + '<path d="M24 36v8" stroke="' + D + '" stroke-width="2.4"/>'
                + (lit === "blink"
                        ? '<path d="M33 24l4-2M33 28h5M33 32l4 2M15 24l-4-2M15 28h-5M15 32l-4 2" stroke="' + G + '" stroke-width="2"/>'
                        : "");
    }

    function car(x, y, color) {
        return '<g transform="translate(' + x + " " + y + ')">'
                + '<path d="M-11 2 L-8 -5 Q-7 -7 -5 -7 L5 -7 Q7 -7 8 -5 L11 2 Z" fill="' + color + '"/>'
                + '<rect x="-13" y="1" width="26" height="7" rx="2.5" fill="' + color + '"/>'
                + '<circle cx="-7" cy="9" r="2.6" fill="' + D + '"/><circle cx="7" cy="9" r="2.6" fill="' + D + '"/></g>';
    }

    function busFront() {
        return '<rect x="12" y="7" width="24" height="30" rx="5" fill="' + B + '"/>'
                + '<rect x="15.5" y="11" width="17" height="11" rx="2" fill="#FFFFFF"/>'
                + '<circle cx="17.5" cy="29" r="2" fill="#FFFFFF"/><circle cx="30.5" cy="29" r="2" fill="#FFFFFF"/>'
                + '<path d="M16 37v4M32 37v4" stroke="' + D + '" stroke-width="3"/>';
    }

    function train(doorsOpen) {
        return '<rect x="8" y="8" width="32" height="28" rx="6" fill="' + P + '"/>'
                + (doorsOpen
                        ? '<rect x="14" y="14" width="7" height="22" fill="#FFFFFF"/><rect x="27" y="14" width="7" height="22" fill="#FFFFFF"/>'
                        : '<rect x="17" y="14" width="14" height="22" fill="#FFFFFF"/><path d="M24 14v22" stroke="' + P + '" stroke-width="2"/>')
                + '<path d="M6 42h36" stroke="' + D + '" stroke-width="2.4"/>';
    }

    var ICONS = {
        // 횡단보도 줄무늬 + 초록불
        crosswalk: svg('<rect x="4" y="30" width="40" height="12" rx="2" fill="#5A5A5A"/>'
                + '<path d="M9 32v8M16 32v8M23 32v8M30 32v8M37 32v8" stroke="#FFFFFF" stroke-width="3"/>'
                + '<rect x="17" y="4" width="14" height="22" rx="4" fill="' + D + '"/>'
                + '<circle cx="24" cy="10" r="3.4" fill="#5A5A5A"/><circle cx="24" cy="20" r="3.4" fill="' + G + '"/>'),
        // 멈추고 양쪽 보기: 눈 + 양쪽 화살표
        lookBoth: svg('<ellipse cx="24" cy="24" rx="9" ry="6.5" stroke="' + D + '" stroke-width="2.4"/>'
                + '<circle cx="24" cy="24" r="2.8" fill="' + D + '"/>'
                + '<path d="M3 24h7M6 20l-3 4 3 4M45 24h-7M42 20l3 4-3 4" stroke="' + G + '" stroke-width="2.6"/>'),
        redLight: svg(signal("red")),
        blinkLight: svg(signal("blink")),
        // 인도로 걷기: 사람이 연석 위, 아래 차도
        sidewalk: svg('<rect x="4" y="34" width="40" height="10" fill="#5A5A5A"/><path d="M4 34h40" stroke="' + Y + '" stroke-width="2"/>'
                + '<rect x="4" y="28" width="40" height="6" fill="' + L + '"/>' + walker(22, 18, G)),
        // 휴대폰은 멈춰서
        phone: svg('<rect x="15" y="5" width="18" height="34" rx="4" fill="' + D + '"/><rect x="18" y="10" width="12" height="22" rx="1.5" fill="#FFFFFF"/>'
                + '<circle cx="37" cy="36" r="8" fill="' + R + '"/><rect x="33.5" y="34.5" width="7" height="3" rx="1" fill="#FFFFFF"/>'),
        // 골목에서 나올 때 차 조심
        alley: svg('<path d="M6 6v36M18 6v20" stroke="' + L + '" stroke-width="3"/>' + walker(12, 30, G) + car(33, 33, B)
                + '<path d="M28 15l4 6h-8z" fill="' + Y + '"/><path d="M28 17.5v1.8" stroke="' + D + '" stroke-width="1.6"/>'),
        // 주차장 입구: P + 차
        parking: svg('<rect x="5" y="5" width="16" height="16" rx="3" fill="' + B + '"/>'
                + '<path d="M10 17V9h4a3 3 0 0 1 0 6h-4" stroke="#FFFFFF" stroke-width="2.4"/>' + car(30, 32, D)),
        // 정류장에서 인도 위 기다리기
        busWait: svg('<path d="M10 6v34" stroke="' + D + '" stroke-width="2.4"/><rect x="4" y="6" width="14" height="10" rx="2" fill="' + B + '"/>'
                + '<path d="M8 11h6" stroke="#FFFFFF" stroke-width="2"/>'
                + '<rect x="2" y="40" width="44" height="4" fill="' + L + '"/>' + walker(30, 28, G)),
        busBoard: svg(busFront()),
        // 버스 안 손잡이
        busInside: svg('<path d="M6 8h36" stroke="' + D + '" stroke-width="2.6"/><path d="M24 8v10" stroke="' + D + '" stroke-width="2.2"/>'
                + '<path d="M18 18h12l-2 10h-8z" stroke="' + B + '" stroke-width="2.6"/>'
                + '<path d="M22 24l-2 8M26 24l2 8" stroke="' + G + '" stroke-width="2.4"/>'),
        // 버스 앞뒤로 건너지 않기
        busCross: svg(busFront() + '<circle cx="38" cy="12" r="8" fill="' + R + '"/><path d="M35 9l6 6M41 9l-6 6" stroke="#FFFFFF" stroke-width="2.4"/>'),
        // 안전선 뒤에서 기다리기
        subwayWait: svg('<rect x="2" y="36" width="44" height="8" fill="' + L + '"/><path d="M2 33h44" stroke="' + Y + '" stroke-width="3" stroke-dasharray="4 3"/>'
                + walker(24, 22, G)),
        subwayBoard: svg(train(true) + '<path d="M17 24h-9M11 21l-3 3 3 3" stroke="' + G + '" stroke-width="2.4"/>'),
        subwayDoor: svg(train(false) + '<circle cx="38" cy="12" r="8" fill="' + R + '"/><path d="M35 9l6 6M41 9l-6 6" stroke="#FFFFFF" stroke-width="2.4"/>'),
        // 계단 + 난간
        stairs: svg('<path d="M6 42h8v-8h8v-8h8v-8h8v-8h4" stroke="' + D + '" stroke-width="2.6"/>'
                + '<path d="M8 32L38 6" stroke="' + G + '" stroke-width="2.6"/><path d="M12 29v6M24 18v8M34 10v6" stroke="' + G + '" stroke-width="2"/>'),
        // 우산 + 빗방울
        rain: svg('<path d="M6 24a18 14 0 0 1 36 0z" fill="' + B + '"/><path d="M24 10v24a4 4 0 0 1-8 0" stroke="' + D + '" stroke-width="2.4"/>'
                + '<path d="M8 32l-2 5M38 32l-2 5M30 38l-2 5" stroke="' + B + '" stroke-width="2.2"/>'),
        // 길을 잃었을 때: 위치 핀 + 물음표
        lost: svg('<path d="M24 44s14-14 14-24a14 14 0 0 0-28 0c0 10 14 24 14 24z" fill="' + G + '"/>'
                + '<path d="M20 17a4 4 0 1 1 6 3.4c-1.4.8-2 1.6-2 3" stroke="#FFFFFF" stroke-width="2.6"/><circle cx="24" cy="28" r="1.6" fill="#FFFFFF"/>')
    };

    var TIPS = [
        { icon: "crosswalk", text: "초록불이 켜져도 차가 멈췄는지 살펴요." },
        { icon: "lookBoth", text: "길을 건너기 전에 잠깐 멈추고 양쪽을 봐요." },
        { icon: "redLight", text: "빨간불에는 멈춰서 기다려요." },
        { icon: "blinkLight", text: "초록불이 깜빡이면 다음 신호를 기다려요." },
        { icon: "sidewalk", text: "차도로 내려가지 말고 인도로 걸어요." },
        { icon: "phone", text: "휴대폰을 볼 때는 안전한 곳에 멈춰요." },
        { icon: "alley", text: "골목에서 큰길로 나올 때는 차가 오는지 봐요." },
        { icon: "parking", text: "주차장 입구에서는 드나드는 차를 살펴요." },
        { icon: "busWait", text: "버스가 오면 도로로 내려가지 말고 기다려요." },
        { icon: "busBoard", text: "버스가 완전히 멈추면 타요." },
        { icon: "busInside", text: "버스가 움직일 때는 손잡이를 꼭 잡아요." },
        { icon: "busCross", text: "버스에서 내린 뒤에는 버스 앞뒤로 길을 건너지 않아요." },
        { icon: "subwayWait", text: "지하철을 기다릴 때는 안전선 뒤에 서요." },
        { icon: "subwayBoard", text: "내리는 사람이 모두 내린 뒤에 타요." },
        { icon: "subwayDoor", text: "문이 닫힐 때는 타지 말고 다음 열차를 기다려요." },
        { icon: "stairs", text: "계단에서는 난간을 잡고 천천히 걸어요." },
        { icon: "rain", text: "비 오는 날에는 미끄러지지 않게 천천히 걸어요." },
        { icon: "lost", text: "길을 모르겠으면 안전한 곳에 멈춰 도움을 요청해요." }
    ];

    var order = [];
    var timer = null;

    /** 한 바퀴 다 보여줄 때까지 같은 문구가 다시 안 나오게 섞는다 (바로 앞 문구와도 겹치지 않게) */
    function nextTip(previous) {
        if (!order.length) {
            order = TIPS.slice();
            for (var i = order.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var tmp = order[i];
                order[i] = order[j];
                order[j] = tmp;
            }
            if (previous && order[order.length - 1] === previous && order.length > 1) {
                order.unshift(order.pop());
            }
        }
        return order.pop();
    }

    function show(card, tip) {
        var illust = card.querySelector(".safety-illust");
        var text = card.querySelector(".safety-tip");
        illust.innerHTML = ICONS[tip.icon] || "";
        text.textContent = tip.text;
        card.dataset.tip = tip.icon;
    }

    function start() {
        var card = document.getElementById("safetyCard");
        if (!card) {
            return;
        }

        var current = nextTip(null);
        show(card, current);

        var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        function rotate() {
            // 다른 화면을 보고 있으면 넘기지 않는다
            if (document.hidden) {
                return;
            }
            current = nextTip(current);
            if (reduceMotion) {
                show(card, current);
                return;
            }
            card.classList.add("is-changing");
            window.setTimeout(function () {
                show(card, current);
                card.classList.remove("is-changing");
            }, 250);
        }

        timer = window.setInterval(rotate, INTERVAL_MS);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }

    window.SafetyTips = { tips: TIPS, icons: ICONS, stop: function () { window.clearInterval(timer); } };
})();
