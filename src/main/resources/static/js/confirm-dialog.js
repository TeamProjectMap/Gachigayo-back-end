/*
 * 화면 안에 그리는 확인창.
 * window.confirm()은 앱 화면(WebView)이나 일부 브라우저에서 창이 뜨지 않고 바로 '취소'가 되어
 * 버튼이 아무 일도 안 하는 것처럼 보인다. 그래서 확인창을 직접 그린다.
 *
 * 사용: if (await AppConfirm("삭제할까요?", "삭제")) { ... }
 */
(function () {
    "use strict";

    var STYLE = [
        ".app-confirm-backdrop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.4)}",
        ".app-confirm-box{width:100%;max-width:320px;padding:24px 20px 16px;border-radius:20px;background:#fff;box-shadow:0 8px 30px rgba(0,0,0,.18);font-family:Pretendard,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}",
        ".app-confirm-text{margin:0 0 20px;color:#363636;font-size:16px;font-weight:500;line-height:1.5;text-align:center;word-break:keep-all;white-space:pre-line}",
        ".app-confirm-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}",
        ".app-confirm-actions button{height:48px;border:0;border-radius:12px;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer}",
        ".app-confirm-cancel{background:#f0f0f0;color:#363636}",
        ".app-confirm-ok{background:#018b38;color:#fff}",
        ".app-confirm-ok.danger{background:#ff363b}"
    ].join("");

    function ensureStyle() {
        if (document.getElementById("appConfirmStyle")) {
            return;
        }
        var style = document.createElement("style");
        style.id = "appConfirmStyle";
        style.textContent = STYLE;
        document.head.appendChild(style);
    }

    /**
     * @param {string} message 물어볼 문장
     * @param {string} [okText] 확인 버튼 글자 (기본 "확인")
     * @param {boolean} [danger] 확인 버튼을 빨간색으로 (삭제처럼 되돌릴 수 없는 일)
     * @returns {Promise<boolean>} 확인을 누르면 true
     */
    window.AppConfirm = function (message, okText, danger) {
        ensureStyle();

        return new Promise(function (resolve) {
            var previousFocus = document.activeElement;
            var backdrop = document.createElement("div");
            backdrop.className = "app-confirm-backdrop";

            var box = document.createElement("div");
            box.className = "app-confirm-box";
            box.setAttribute("role", "alertdialog");
            box.setAttribute("aria-modal", "true");

            var text = document.createElement("p");
            text.className = "app-confirm-text";
            text.id = "appConfirmText";
            text.textContent = message;
            box.setAttribute("aria-labelledby", text.id);

            var actions = document.createElement("div");
            actions.className = "app-confirm-actions";

            var cancel = document.createElement("button");
            cancel.type = "button";
            cancel.className = "app-confirm-cancel";
            cancel.textContent = "취소";

            var ok = document.createElement("button");
            ok.type = "button";
            ok.className = "app-confirm-ok" + (danger ? " danger" : "");
            ok.textContent = okText || "확인";

            function close(result) {
                document.removeEventListener("keydown", onKey);
                backdrop.remove();
                if (previousFocus && previousFocus.focus) {
                    previousFocus.focus({ preventScroll: true });
                }
                resolve(result);
            }

            function onKey(event) {
                if (event.key === "Escape") {
                    close(false);
                }
            }

            cancel.addEventListener("click", function () { close(false); });
            ok.addEventListener("click", function () { close(true); });
            // 바깥 어두운 곳을 누르면 취소
            backdrop.addEventListener("click", function (event) {
                if (event.target === backdrop) {
                    close(false);
                }
            });
            document.addEventListener("keydown", onKey);

            actions.append(cancel, ok);
            box.append(text, actions);
            backdrop.appendChild(box);
            document.body.appendChild(backdrop);
            ok.focus();
        });
    };
})();
