(function ($) {
    const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,16}$/;

    const state = {
        authSent: false,
        timerId: null,
        remainingSeconds: 0
    };

    $(function () {
        $("[data-action='send-auth']").on("click", function () {
            sendAuth($(this));
        });

        $("[data-action='search-password']").on("click", function () {
            searchPassword($(this));
        });

        $("[data-action='new-password']").on("click", function () {
            newPassword($(this));
        });

        $("[data-action='go-login']").on("click", function () {
            window.location.href = "/login.html";
        });

        $("[data-action='go-find-id']").on("click", function () {
            window.location.href = "/find-id.html";
        });

        $("[data-action='go-signup']").on("click", function () {
            window.location.href = "/signup.html";
        });

        $("#loginId, #userName, #email").on("input", function () {
            resetAuthState();
        });

        $("#loginId, #userName, #email").on("keydown", function (event) {
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
                $("[data-action='search-password']").trigger("click");
            }
        });

        $("#password, #passwordConfirm").on("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                $("[data-action='new-password']").trigger("click");
            }
        });

        $("#password, #passwordConfirm").on("input", function () {
            validatePasswordFields(false);
        });
    });

    function sendAuth($button) {
        const loginId = $("#loginId").val().trim();
        const userName = $("#userName").val().trim();
        const email = $("#email").val().trim();

        clearMessages();

        if (!loginId) {
            setMessage("loginId", "아이디를 입력해주세요.", false);
            return;
        }

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
            url: "/user/sendFindPasswordAuth",
            type: "post",
            dataType: "JSON",
            data: {
                loginId: loginId,
                userName: userName,
                email: email
            },
            success: function (json) {
                if (json.success) {
                    state.authSent = true;
                    $("#authCode").val("");
                    $("[data-auth-field]").removeClass("hidden");
                    $button.text("재발송");
                    startTimer();
                    setMessage("email", json.message || "입력하신 이메일로 인증번호를 발송했습니다.", true);
                } else {
                    resetAuthState();
                    setMessage("searchForm", json.message || "입력하신 정보와 일치하는 회원이 없습니다.", false);
                }

                $button.prop("disabled", false);
            },
            error: function () {
                resetAuthState();
                setMessage("searchForm", "인증번호 발송 중 오류가 발생했습니다.", false);
                $button.prop("disabled", false);
            }
        });
    }

    function searchPassword($button) {
        const authCode = $("#authCode").val().trim();

        clearMessages();

        if (!state.authSent) {
            setMessage("searchForm", "이메일 인증을 먼저 진행해주세요.", false);
            return;
        }

        if (!authCode) {
            setMessage("authCode", "인증번호를 입력해주세요.", false);
            return;
        }

        $button.prop("disabled", true);

        $.ajax({
            url: "/user/searchPassword",
            type: "post",
            dataType: "JSON",
            data: { authCode: authCode },
            success: function (json) {
                if (json.success) {
                    stopTimer();
                    showNewPasswordStep(json.userName);
                } else {
                    setMessage("authCode", json.message || "인증번호가 올바르지 않습니다.", false);
                }

                $button.prop("disabled", false);
            },
            error: function () {
                setMessage("searchForm", "비밀번호 찾기 처리 중 오류가 발생했습니다.", false);
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
        stopTimer();
        $("[data-auth-field]").addClass("hidden");
        clearMessage("authCode");
        clearMessage("searchForm");
    }

    function newPassword($button) {
        clearMessages();

        if (!validatePasswordFields(true)) {
            return;
        }

        $button.prop("disabled", true);

        $.ajax({
            url: "/user/newPassword",
            type: "post",
            dataType: "JSON",
            data: {
                password: $("#password").val()
            },
            success: function (json) {
                if (json.success) {
                    showResult();
                } else {
                    setMessage("newPasswordForm", json.message || "비밀번호 재설정에 실패했습니다.", false);
                    $button.prop("disabled", false);
                }
            },
            error: function () {
                setMessage("newPasswordForm", "비밀번호 재설정 처리 중 오류가 발생했습니다.", false);
                $button.prop("disabled", false);
            }
        });
    }

    function validatePasswordFields(showMessage) {
        const password = $("#password").val();
        const passwordConfirm = $("#passwordConfirm").val();
        let valid = true;

        if (!PASSWORD_PATTERN.test(password)) {
            if (showMessage || password) {
                setMessage("password", "8~16자 영문, 숫자, 특수문자를 포함해주세요.", false);
            }
            valid = false;
        } else {
            clearMessage("password");
        }

        if (passwordConfirm && password !== passwordConfirm) {
            setMessage("passwordConfirm", "비밀번호가 일치하지 않습니다.", false);
            valid = false;
        } else if (showMessage && !passwordConfirm) {
            setMessage("passwordConfirm", "비밀번호 확인을 입력해주세요.", false);
            valid = false;
        } else if (passwordConfirm) {
            clearMessage("passwordConfirm");
        }

        return valid;
    }

    function showNewPasswordStep(userName) {
        $("#newPasswordTitle").text((userName || "") + " 회원님의 비밀번호 재설정");
        $("#searchSection").addClass("hidden");
        $("#newPasswordSection").removeClass("hidden");
        window.scrollTo(0, 0);
    }

    function showResult() {
        $("#newPasswordSection").addClass("hidden");
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
