(function ($) {
    $(function () {
        $("#loginBtn").on("click", function () {
            login($(this));
        });

        $("#signupBtn").on("click", function () {
            window.location.href = "/signup.html";
        });

        $("#loginId, #password").on("keydown", function (event) {
            if (event.key === "Enter") {
                event.preventDefault();
                $("#loginBtn").trigger("click");
            }
        });

        $("[data-action='go-find-id']").on("click", function () {
            window.location.href = "/find-id.html";
        });

        $("[data-action='go-find-password']").on("click", function () {
            window.location.href = "/find-password.html";
        });
    });

    function login($button) {
        const loginId = $("#loginId").val().trim();
        const password = $("#password").val();

        clearMessages();

        if (!loginId) {
            setFieldMessage("loginId", "아이디를 입력해주세요.");
            return;
        }

        if (!password) {
            setFieldMessage("password", "비밀번호를 입력해주세요.");
            return;
        }

        $button.prop("disabled", true);

        $.ajax({
            url: "/user/login",
            type: "post",
            dataType: "JSON",
            data: {
                loginId: loginId,
                password: password
            },
            success: function (json) {
                if (json.success) {
                    if (json.userRole === "USER") {
                        window.location.href = "/user-home.html";
                    } else if (json.userRole === "GUARDIAN") {
                        window.location.href = "/guardian-home.html";
                    } else {
                        setLoginMessage("사용자 역할을 확인할 수 없습니다.");
                        $button.prop("disabled", false);
                    }
                } else {
                    setLoginMessage(json.message || "아이디 또는 비밀번호를 확인해주세요.");
                    $button.prop("disabled", false);
                }
            },
            error: function () {
                setLoginMessage("로그인 처리 중 오류가 발생했습니다.");
                $button.prop("disabled", false);
            }
        });
    }

    function setFieldMessage(key, message) {
        $("[data-message-for='" + key + "']").text(message);
    }

    function setLoginMessage(message) {
        $("#loginMessage").text(message);
    }

    function clearMessages() {
        $(".field-message").text("");
    }
})(jQuery);
