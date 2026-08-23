(function ($) {
    const state = {
        user: {
            loginIdChecked: false,
            loginIdValue: "",
            emailVerified: false,
            emailValue: "",
            timerId: null,
            remainingSeconds: 0
        },
        guardian: {
            loginIdChecked: false,
            loginIdValue: "",
            emailVerified: false,
            emailValue: "",
            linkCodeChecked: false,
            linkCodeValue: "",
            timerId: null,
            remainingSeconds: 0
        }
    };

    const formMap = {
        user: {
            form: "#userForm",
            userName: "#userName",
            loginId: "#userLoginId",
            email: "#userEmail",
            authCode: "#userAuthCode",
            password: "#userPassword",
            passwordConfirm: "#userPasswordConfirm"
        },
        guardian: {
            form: "#guardianForm",
            linkCode: "#guardianLinkCode",
            userName: "#guardianName",
            loginId: "#guardianLoginId",
            email: "#guardianEmail",
            authCode: "#guardianAuthCode",
            password: "#guardianPassword",
            passwordConfirm: "#guardianPasswordConfirm",
            phone: "#guardianPhone"
        }
    };

    $(function () {
        bindEvents();
    });

    function bindEvents() {
        $(".tab-button").on("click", function () {
            switchTab($(this).data("tab"));
        });

        $("[data-action='check-login-id']").on("click", function () {
            checkLoginId($(this).data("form"), $(this));
        });

        $("[data-action='send-email-auth']").on("click", function () {
            sendEmailAuth($(this).data("form"), $(this));
        });

        $("[data-action='check-email-auth']").on("click", function () {
            checkEmailAuth($(this).data("form"), $(this));
        });

        $("[data-action='check-link-code']").on("click", function () {
            checkLinkCode($(this));
        });

        $("[data-action='register-user']").on("click", function () {
            registerUser($(this));
        });

        $("[data-action='register-guardian']").on("click", function () {
            registerGuardian($(this));
        });

        $(".login-button").on("click", function () {
            window.location.href = "/login.html";
        });

        $(formMap.user.loginId).on("input", function () {
            resetLoginIdState("user");
        });

        $(formMap.guardian.loginId).on("input", function () {
            resetLoginIdState("guardian");
        });

        $(formMap.user.email).on("input", function () {
            resetEmailState("user");
        });

        $(formMap.guardian.email).on("input", function () {
            resetEmailState("guardian");
        });

        $(formMap.guardian.linkCode).on("input", function () {
            const formatted = formatLinkCode($(this).val());
            $(this).val(formatted);
            resetLinkCodeState();
        });

        $(formMap.guardian.phone).on("input", function () {
            $(this).val($(this).val().replace(/[^0-9]/g, ""));
        });

        $("#agreeAll").on("change", function () {
            $(".term-check").prop("checked", $(this).is(":checked"));
            clearMessage("userTerms");
        });

        $(".term-check").on("change", function () {
            $("#agreeAll").prop("checked", $(".term-check").length === $(".term-check:checked").length);
            clearMessage("userTerms");
        });

        $(formMap.user.password + ", " + formMap.user.passwordConfirm).on("input", function () {
            validatePasswordFields("user", false);
        });

        $(formMap.guardian.password + ", " + formMap.guardian.passwordConfirm).on("input", function () {
            validatePasswordFields("guardian", false);
        });

        $(formMap.user.authCode + ", " + formMap.guardian.authCode).on("input", function () {
            $(this).val($(this).val().replace(/[^0-9]/g, "").slice(0, 6));
        });
    }

    function switchTab(tab) {
        $(".tab-button").removeClass("active");
        $(".tab-button[data-tab='" + tab + "']").addClass("active");
        $("#userForm").toggleClass("hidden", tab !== "user");
        $("#guardianForm").toggleClass("hidden", tab !== "guardian");
    }

    function checkLoginId(type, $button) {
        const loginId = $(formMap[type].loginId).val().trim();
        const messageKey = type === "user" ? "userLoginId" : "guardianLoginId";

        if (!loginId) {
            setMessage(messageKey, "아이디를 입력해주세요.", false);
            return;
        }

        withDisabled($button, function (done) {
            $.ajax({
                url: "/user/getLoginIdExists",
                type: "post",
                dataType: "JSON",
                data: { loginId: loginId },
                success: function (json) {
                    if (json.success && json.duplicated === false) {
                        state[type].loginIdChecked = true;
                        state[type].loginIdValue = loginId;
                        setMessage(messageKey, json.message || "사용 가능한 아이디입니다.", true);
                    } else {
                        state[type].loginIdChecked = false;
                        state[type].loginIdValue = "";
                        setMessage(messageKey, json.message || "이미 사용 중인 아이디입니다.", false);
                    }
                },
                error: function () {
                    setMessage(messageKey, "아이디 중복 확인 중 오류가 발생했습니다.", false);
                },
                complete: done
            });
        });
    }

    function sendEmailAuth(type, $button) {
        const email = $(formMap[type].email).val().trim();
        const messageKey = type === "user" ? "userEmail" : "guardianEmail";

        if (!email) {
            setMessage(messageKey, "이메일을 입력해주세요.", false);
            return;
        }

        withDisabled($button, function (done) {
            $.ajax({
                url: "/user/sendEmailAuth",
                type: "post",
                dataType: "JSON",
                data: { email: email },
                success: function (json) {
                    if (json.success) {
                        state[type].emailVerified = false;
                        state[type].emailValue = email;
                        $(formMap[type].authCode).val("");
                        $("[data-auth-field='" + type + "']").removeClass("hidden");
                        startTimer(type);
                        setMessage(messageKey, json.message || "인증번호를 발송했습니다.", true);
                        clearMessage(type === "user" ? "userAuthCode" : "guardianAuthCode");
                    } else {
                        resetEmailState(type);
                        setMessage(messageKey, json.message || "인증번호 발송에 실패했습니다.", false);
                    }
                },
                error: function () {
                    resetEmailState(type);
                    setMessage(messageKey, "인증번호 발송 중 오류가 발생했습니다.", false);
                },
                complete: done
            });
        });
    }

    function checkEmailAuth(type, $button) {
        const email = $(formMap[type].email).val().trim();
        const authCode = $(formMap[type].authCode).val().trim();
        const messageKey = type === "user" ? "userAuthCode" : "guardianAuthCode";

        if (!authCode) {
            setMessage(messageKey, "인증번호를 입력해주세요.", false);
            return;
        }

        withDisabled($button, function (done) {
            $.ajax({
                url: "/user/checkEmailAuth",
                type: "post",
                dataType: "JSON",
                data: {
                    email: email,
                    authCode: authCode
                },
                success: function (json) {
                    if (json.success) {
                        state[type].emailVerified = true;
                        state[type].emailValue = email;
                        stopTimer(type);
                        setMessage(messageKey, json.message || "인증이 완료되었습니다.", true);
                    } else {
                        state[type].emailVerified = false;
                        setMessage(messageKey, json.message || "인증정보가 올바르지 않습니다.", false);
                    }
                },
                error: function () {
                    setMessage(messageKey, "인증 확인 중 오류가 발생했습니다.", false);
                },
                complete: done
            });
        });
    }

    function checkLinkCode($button) {
        const linkCode = $(formMap.guardian.linkCode).val().trim();

        if (!linkCode) {
            setMessage("guardianLinkCode", "연결코드를 입력해주세요.", false);
            return;
        }

        withDisabled($button, function (done) {
            $.ajax({
                url: "/user/checkLinkCode",
                type: "post",
                dataType: "JSON",
                data: { linkCode: linkCode },
                success: function (json) {
                    if (json.success) {
                        state.guardian.linkCodeChecked = true;
                        state.guardian.linkCodeValue = linkCode;
                        setMessage("guardianLinkCode", json.message || "연결코드가 확인되었습니다.", true);
                    } else {
                        state.guardian.linkCodeChecked = false;
                        state.guardian.linkCodeValue = "";
                        setMessage("guardianLinkCode", json.message || "유효하지 않은 코드입니다.", false);
                    }
                },
                error: function () {
                    setMessage("guardianLinkCode", "연결코드 확인 중 오류가 발생했습니다.", false);
                },
                complete: done
            });
        });
    }

    function registerUser($button) {
        if (!validateUserForm()) {
            return;
        }

        withDisabled($button, function (done) {
            $.ajax({
                url: "/user/registerUser",
                type: "post",
                dataType: "JSON",
                data: {
                    userName: $(formMap.user.userName).val().trim(),
                    loginId: $(formMap.user.loginId).val().trim(),
                    email: $(formMap.user.email).val().trim(),
                    password: $(formMap.user.password).val()
                },
                success: function (json) {
                    if (json.success) {
                        $("#completeLinkCode").text(json.linkCode || "");
                        showComplete("user");
                    } else {
                        setMessage("userTerms", json.message || "회원가입에 실패했습니다.", false);
                        done();
                    }
                },
                error: function () {
                    setMessage("userTerms", "회원가입 처리 중 오류가 발생했습니다.", false);
                    done();
                }
            });
        });
    }

    function registerGuardian($button) {
        if (!validateGuardianForm()) {
            return;
        }

        withDisabled($button, function (done) {
            $.ajax({
                url: "/user/registerGuardian",
                type: "post",
                dataType: "JSON",
                data: {
                    linkCode: $(formMap.guardian.linkCode).val().trim(),
                    userName: $(formMap.guardian.userName).val().trim(),
                    loginId: $(formMap.guardian.loginId).val().trim(),
                    email: $(formMap.guardian.email).val().trim(),
                    password: $(formMap.guardian.password).val(),
                    phone: $(formMap.guardian.phone).val().trim()
                },
                success: function (json) {
                    if (json.success) {
                        showComplete("guardian");
                    } else {
                        setMessage("guardianPhone", json.message || "회원가입에 실패했습니다.", false);
                        done();
                    }
                },
                error: function () {
                    setMessage("guardianPhone", "회원가입 처리 중 오류가 발생했습니다.", false);
                    done();
                }
            });
        });
    }

    function validateUserForm() {
        let valid = true;

        valid = requireValue("userName", $(formMap.user.userName).val(), "이름을 입력해주세요.") && valid;
        valid = requireLoginIdChecked("user", "userLoginId") && valid;
        valid = requireEmailVerified("user", "userEmail") && valid;
        valid = validatePasswordFields("user", true) && valid;
        valid = requireTerms() && valid;

        return valid;
    }

    function validateGuardianForm() {
        let valid = true;

        valid = requireLinkCodeChecked() && valid;
        valid = requireValue("guardianName", $(formMap.guardian.userName).val(), "이름을 입력해주세요.") && valid;
        valid = requireLoginIdChecked("guardian", "guardianLoginId") && valid;
        valid = requireEmailVerified("guardian", "guardianEmail") && valid;
        valid = validatePasswordFields("guardian", true) && valid;
        valid = requireValue("guardianPhone", $(formMap.guardian.phone).val(), "연락처를 입력해주세요.") && valid;

        return valid;
    }

    function requireValue(messageKey, value, message) {
        if (!value || !value.trim()) {
            setMessage(messageKey, message, false);
            return false;
        }

        clearMessage(messageKey);
        return true;
    }

    function requireLoginIdChecked(type, messageKey) {
        const loginId = $(formMap[type].loginId).val().trim();
        if (!loginId) {
            setMessage(messageKey, "아이디를 입력해주세요.", false);
            return false;
        }

        if (!state[type].loginIdChecked || state[type].loginIdValue !== loginId) {
            setMessage(messageKey, "아이디 중복확인을 완료해주세요.", false);
            return false;
        }

        return true;
    }

    function requireEmailVerified(type, messageKey) {
        const email = $(formMap[type].email).val().trim();
        if (!email) {
            setMessage(messageKey, "이메일을 입력해주세요.", false);
            return false;
        }

        if (!state[type].emailVerified || state[type].emailValue !== email) {
            setMessage(messageKey, "이메일 인증을 완료해주세요.", false);
            return false;
        }

        return true;
    }

    function requireLinkCodeChecked() {
        const linkCode = $(formMap.guardian.linkCode).val().trim();
        if (!linkCode) {
            setMessage("guardianLinkCode", "연결코드를 입력해주세요.", false);
            return false;
        }

        if (!state.guardian.linkCodeChecked || state.guardian.linkCodeValue !== linkCode) {
            setMessage("guardianLinkCode", "연결코드 확인을 완료해주세요.", false);
            return false;
        }

        return true;
    }

    function requireTerms() {
        if ($(".required-term").length !== $(".required-term:checked").length) {
            setMessage("userTerms", "필수 약관에 동의해주세요.", false);
            return false;
        }

        clearMessage("userTerms");
        return true;
    }

    function validatePasswordFields(type, showMessage) {
        const password = $(formMap[type].password).val();
        const confirm = $(formMap[type].passwordConfirm).val();
        const passwordKey = type === "user" ? "userPassword" : "guardianPassword";
        const confirmKey = type === "user" ? "userPasswordConfirm" : "guardianPasswordConfirm";
        const validPassword = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,16}$/.test(password);
        let valid = true;

        if (!validPassword) {
            if (showMessage || password) {
                setMessage(passwordKey, "8~16자 영문, 숫자, 특수문자를 포함해주세요.", false);
            }
            valid = false;
        } else {
            clearMessage(passwordKey);
        }

        if (confirm && password !== confirm) {
            setMessage(confirmKey, "비밀번호가 일치하지 않습니다.", false);
            valid = false;
        } else if (showMessage && !confirm) {
            setMessage(confirmKey, "비밀번호 확인을 입력해주세요.", false);
            valid = false;
        } else if (confirm) {
            clearMessage(confirmKey);
        }

        return valid;
    }

    function startTimer(type) {
        stopTimer(type);
        state[type].remainingSeconds = 300;
        updateTimer(type);

        state[type].timerId = window.setInterval(function () {
            state[type].remainingSeconds -= 1;
            updateTimer(type);

            if (state[type].remainingSeconds <= 0) {
                stopTimer(type);
                state[type].emailVerified = false;
                setMessage(type === "user" ? "userAuthCode" : "guardianAuthCode",
                    "인증시간이 만료되었습니다. 인증번호를 다시 받아주세요.", false);
            }
        }, 1000);
    }

    function stopTimer(type) {
        if (state[type].timerId) {
            window.clearInterval(state[type].timerId);
            state[type].timerId = null;
        }
    }

    function updateTimer(type) {
        const seconds = Math.max(state[type].remainingSeconds, 0);
        const minutesText = String(Math.floor(seconds / 60)).padStart(2, "0");
        const secondsText = String(seconds % 60).padStart(2, "0");
        $("[data-timer-for='" + type + "']").text(minutesText + ":" + secondsText);
    }

    function resetLoginIdState(type) {
        state[type].loginIdChecked = false;
        state[type].loginIdValue = "";
        clearMessage(type === "user" ? "userLoginId" : "guardianLoginId");
    }

    function resetEmailState(type) {
        state[type].emailVerified = false;
        state[type].emailValue = "";
        stopTimer(type);
        $("[data-auth-field='" + type + "']").addClass("hidden");
        clearMessage(type === "user" ? "userEmail" : "guardianEmail");
        clearMessage(type === "user" ? "userAuthCode" : "guardianAuthCode");
    }

    function resetLinkCodeState() {
        state.guardian.linkCodeChecked = false;
        state.guardian.linkCodeValue = "";
        clearMessage("guardianLinkCode");
    }

    function formatLinkCode(value) {
        const cleanValue = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
        if (cleanValue.length <= 4) {
            return cleanValue;
        }

        return cleanValue.slice(0, 4) + "-" + cleanValue.slice(4);
    }

    function showComplete(type) {
        $("#signupSection").addClass("hidden");
        $("#userCompleteSection").toggleClass("hidden", type !== "user");
        $("#guardianCompleteSection").toggleClass("hidden", type !== "guardian");
        stopTimer("user");
        stopTimer("guardian");
        window.scrollTo(0, 0);
    }

    function setMessage(key, message, success) {
        const $target = $("[data-message-for='" + key + "']");
        $target
            .removeClass("success error")
            .addClass(success ? "success" : "error")
            .text(message || "");
    }

    function clearMessage(key) {
        $("[data-message-for='" + key + "']").removeClass("success error").text("");
    }

    function withDisabled($button, worker) {
        $button.prop("disabled", true);
        worker(function () {
            $button.prop("disabled", false);
        });
    }
})(jQuery);
