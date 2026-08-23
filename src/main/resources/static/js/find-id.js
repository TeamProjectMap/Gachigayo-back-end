(function ($) {
    const state = {
        authSent: false,
        userName: "",
        email: "",
        timerId: null,
        remainingSeconds: 0
    };

    $(function () {
        $("[data-action='send-auth']").on("click", function () {
            sendAuth($(this));
        });

        $("[data-action='search-login-id']").on("click", function () {
            searchLoginId($(this));
        });

        $("[data-action='go-login']").on("click", function () {
            window.location.href = "/login.html";
        });

        $("[data-action='go-find-password']").on("click", function () {
            window.location.href = "/find-password.html";
        });

        $("[data-action='go-signup']").on("click", function () {
            window.location.href = "/signup.html";
        });

        $("#userName, #email").on("input", function () {
            resetAuthState();
        });

        $("#userName, #email").on("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                $("[data-action='send-auth']").trigger("click");
            }
        });

        $("#authCode").on("input", function () {
            $(this).val($(this).val().replace(/[^0-9]/g, "").slice(0, 6));
        });

        $("#authCode").on("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                $("[data-action='search-login-id']").trigger("click");
            }
        });
    });

    function sendAuth($button) {
        const userName = $("#userName").val().trim();
        const email = $("#email").val().trim();

        clearMessages();

        if (!userName) {
            setMessage("userName", "이름을 입력해주세요.", false);
            return;
        }

        if (!email) {
            setMessage("email", "이메일을 입력해주세요.", false);
            return;
        }

        $button.prop("disabled", true);

        $.ajax({
            url: "/user/sendFindIdAuth",
            type: "post",
            dataType: "JSON",
            data: {
                userName: userName,
                email: email
            },
            success: function (json) {
                if (json.success) {
                    state.authSent = true;
                    state.userName = userName;
                    state.email = email;
                    $("#authCode").val("");
                    $("[data-auth-field]").removeClass("hidden");
                    $button.text("재발송");
                    startTimer();
                    setMessage("email", json.message || "입력하신 이메일로 인증번호를 발송했습니다.", true);
                } else {
                    resetAuthState();
                    setMessage("form", json.message || "입력하신 정보와 일치하는 아이디가 없습니다.", false);
                }

                $button.prop("disabled", false);
            },
            error: function () {
                resetAuthState();
                setMessage("form", "인증번호 발송 중 오류가 발생했습니다.", false);
                $button.prop("disabled", false);
            }
        });
    }

    function searchLoginId($button) {
        const authCode = $("#authCode").val().trim();

        clearMessages();

        if (!state.authSent) {
            setMessage("form", "이메일 인증을 먼저 진행해주세요.", false);
            return;
        }

        if (!authCode) {
            setMessage("authCode", "인증번호를 입력해주세요.", false);
            return;
        }

        $button.prop("disabled", true);

        $.ajax({
            url: "/user/searchLoginId",
            type: "post",
            dataType: "JSON",
            data: { authCode: authCode },
            success: function (json) {
                if (json.success) {
                    stopTimer();
                    showResult(json.userName, json.loginId);
                } else {
                    setMessage("authCode", json.message || "인증번호가 올바르지 않습니다.", false);
                    $button.prop("disabled", false);
                }
            },
            error: function () {
                setMessage("form", "아이디 찾기 처리 중 오류가 발생했습니다.", false);
                $button.prop("disabled", false);
            }
        });
    }

    function startTimer() {
        stopTimer();
        state.remainingSeconds = 300;
        updateTimer();

        state.timerId = window.setInterval(function () {
            state.remainingSeconds -= 1;
            updateTimer();

            if (state.remainingSeconds <= 0) {
                stopTimer();
                state.authSent = false;
                setMessage("authCode", "인증시간이 만료되었습니다. 인증번호를 다시 받아주세요.", false);
            }
        }, 1000);
    }

    function stopTimer() {
        if (state.timerId) {
            window.clearInterval(state.timerId);
            state.timerId = null;
        }
    }

    function updateTimer() {
        const seconds = Math.max(state.remainingSeconds, 0);
        const minutesText = String(Math.floor(seconds / 60)).padStart(2, "0");
        const secondsText = String(seconds % 60).padStart(2, "0");
        $("[data-timer]").text(minutesText + ":" + secondsText);
    }

    function resetAuthState() {
        state.authSent = false;
        state.userName = "";
        state.email = "";
        stopTimer();
        $("[data-auth-field]").addClass("hidden");
        clearMessage("authCode");
        clearMessage("form");
    }

    function showResult(userName, loginId) {
        $("#resultUserName").text((userName || "") + " 회원님의 아이디입니다.");
        $("#resultLoginId").text(loginId || "");
        $("#searchSection").addClass("hidden");
        $("#resultSection").removeClass("hidden");
        window.scrollTo(0, 0);
    }

    function setMessage(key, message, success) {
        $("[data-message-for='" + key + "']")
            .removeClass("success error")
            .addClass(success ? "success" : "error")
            .text(message || "");
    }

    function clearMessage(key) {
        $("[data-message-for='" + key + "']").removeClass("success error").text("");
    }

    function clearMessages() {
        $(".field-message").removeClass("success error").text("");
    }
})(jQuery);
