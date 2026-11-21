(function ($) {

    var userRole = null;
    var sessionUserId = null;

    // 마지막으로 저장된 관계. 값이 그대로면 굳이 다시 저장하지 않는다
    var savedRelation = "";

    $(function () {
        checkSession();

        $(".ready-button").on("click", function () {
            setMessage($(this).data("ready-message"), true);
        });

        $("#homeButton").on("click", function () {
            goHome();
        });

        $("#routeButton").on("click", function () {
            window.location.href = userRole === "GUARDIAN" ? "/route-manage.html" : "/route-search.html";
        });

        // 저장 버튼이 없는 화면이라 입력칸을 벗어나거나 엔터를 치면 저장한다
        $("#relationInput").on("blur", function () {
            updateRelation($(this).val());
        });

        $("#relationInput").on("keydown", function (event) {
            if (event.key === "Enter") {
                $(this).blur();
            }
        });

        $("#arrivalAlarmToggle").on("change", function () {
            updateAlarm("/settings/alarm", $(this));
        });

        $("#deviationAlarmToggle").on("change", function () {
            updateAlarm("/settings/alarm/deviation", $(this));
        });

        $("#connectButton").on("click", function () {
            connect($(this));
        });

        // window.confirm은 앱 화면(WebView) 등에서 창 없이 바로 '취소'가 돼서 버튼이 안 먹었다 → 화면 안 확인창
        $("#reissueButton").on("click", function () {
            var $button = $(this);
            AppConfirm("연결코드를 다시 받으면 이전 코드는 쓸 수 없어요. 계속할까요?", "다시 받기").then(function (ok) {
                if (ok) {
                    request($button, { url: "/link/code/reissue" });
                }
            });
        });

        $("#disconnectButton").on("click", function () {
            var $button = $(this);
            AppConfirm("연결을 해제할까요?", "해제", true).then(function (ok) {
                if (ok) {
                    request($button, { url: "/link/disconnect" });
                }
            });
        });

        $("#logoutButton").on("click", function () {
            logout();
        });

        $("#linkCodeInput").on("input", function () {
            $(this).val($(this).val().toUpperCase());
        });
    });

    function checkSession() {
        $.ajax({
            url: "/user/session",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success) {
                    window.location.replace("/login.html");
                    return;
                }

                userRole = json.userRole;
                sessionUserId = json.userId;
                $("#profileLoginId").text(json.loginId || "-");
                $("#profileLoginId").toggleClass("hidden", userRole !== "USER");
                $("#userSettingsSection").toggleClass("hidden", userRole !== "USER");
                $("#guardianAlarmSection").toggleClass("hidden", userRole === "USER");
                $("#routeButton span").text(userRole === "USER" ? "길안내" : "경로");
                var prefs = JourneyState.preferences(sessionUserId, localStorage);
                $("#shareLocationToggle").prop("checked", prefs.shareLocation);
                $("#shareLocationToggle").on("change", function () {
                    try {
                        JourneyState.savePreference(sessionUserId, "shareLocation", this.checked, localStorage);
                        setMessage("이 기기의 설정을 저장했습니다.", true);
                    } catch (error) {
                        this.checked = !this.checked;
                        setMessage("설정을 저장하지 못했습니다. 브라우저 저장 공간을 확인해주세요.", false);
                    }
                });
                $("#settingsPage").removeClass("hidden");
                loadSettings();
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    /* ---------------------------- 조회 ---------------------------- */

    function loadSettings() {
        $.ajax({
            url: "/settings",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success) {
                    setMessage(json.message, false);
                    return;
                }

                renderProfile(json);
                renderAlarm(json);
                renderLink(json);
            },
            error: function () {
                setMessage("설정을 불러오지 못했습니다.", false);
            }
        });
    }

    function renderProfile(json) {
        $("#profileName").text(json.userName || "-");
        $("#profilePhone").text(json.phone || "등록된 번호 없음");
        // 이용자에게는 자기 번호 줄이 필요 없어 보호자일 때만 보여준다
        $("#phoneRow").toggleClass("hidden", json.userRole !== "GUARDIAN");

        // 관계는 보호자에게만 있는 항목이라 보호자일 때만 줄을 보여준다
        if (json.userRole === "GUARDIAN") {
            savedRelation = json.relation || "";
            $("#relationInput").val(savedRelation);
            $("#relationRow").removeClass("hidden");
        }
    }

    function renderAlarm(json) {
        $("#arrivalAlarmToggle").prop("checked", json.arrivalAlarmOn !== false);
        $("#deviationAlarmToggle").prop("checked", json.deviationAlarmOn !== false);
    }

    function renderLink(json) {
        var isUser = json.userRole === "USER";
        $("#disconnectButton, #reissueButton, #connectBox").addClass("hidden");
        $("#linkCodeRow").removeClass("hidden");

        $("#linkSectionTitle").text(isUser ? "보호자 연결 관리" : "사용자 연결 관리");

        if (json.linked) {
            $("#linkStatusText").text((isUser ? "보호자" : "사용자") + "와 연결됨");
            $("#disconnectButton").removeClass("hidden");
        } else {
            $("#linkStatusText").text("연결된 " + (isUser ? "보호자" : "사용자") + "가 없습니다");
        }

        if (json.linkCode) {
            $("#linkCodeText").text(json.linkCode);
        } else {
            $("#linkCodeRow").addClass("hidden");
        }

        // 이용자는 코드를 다시 받을 수 있고, 보호자는 코드를 입력해 연결한다
        if (isUser) {
            $("#reissueButton").removeClass("hidden");
        } else if (!json.linked) {
            $("#connectBox").removeClass("hidden");
        }
    }

    /* ---------------------------- 변경 ---------------------------- */

    function updateRelation(relation) {
        var trimmed = $.trim(relation);

        // 화면에도 다듬은 값을 그대로 보여준다
        $("#relationInput").val(trimmed);

        if (trimmed === savedRelation) {
            return;
        }

        $.ajax({
            url: "/settings/relation",
            type: "post",
            dataType: "JSON",
            data: { relation: trimmed },
            success: function (json) {
                setMessage(json.message, json.success);

                if (json.success) {
                    savedRelation = trimmed;
                } else {
                    // 저장에 실패하면 화면만 바뀐 상태로 두지 않고 되돌린다
                    $("#relationInput").val(savedRelation);
                }
            },
            error: function () {
                $("#relationInput").val(savedRelation);
                setMessage("관계 저장 중 오류가 발생했습니다.", false);
            }
        });
    }

    /** 알림 토글 저장. 토글마다 주소만 다르다. */
    function updateAlarm(url, $toggle) {
        var alarmOn = $toggle.is(":checked");

        $.ajax({
            url: url,
            type: "post",
            dataType: "JSON",
            data: { alarmOn: alarmOn },
            success: function (json) {
                setMessage(json.message, json.success);

                // 저장에 실패하면 화면만 바뀐 상태로 두지 않고 되돌린다
                if (!json.success) {
                    $toggle.prop("checked", !alarmOn);
                }
            },
            error: function () {
                setMessage("알림 설정 중 오류가 발생했습니다.", false);
                $toggle.prop("checked", !alarmOn);
            }
        });
    }

    function connect($button) {
        var linkCode = $("#linkCodeInput").val().trim();

        if (!linkCode) {
            setMessage("연결코드를 입력해주세요.", false);
            return;
        }

        request($button, { url: "/link/connect", data: { linkCode: linkCode } });
    }

    /**
     * 연결 상태가 바뀌면 화면 곳곳이 함께 달라져서 새로 그리는 게 확실하다.
     */
    function request($button, option) {
        $button.prop("disabled", true);

        $.ajax({
            url: option.url,
            type: "post",
            dataType: "JSON",
            data: option.data,
            success: function (json) {
                setMessage(json.message, json.success);

                if (json.success) {
                    window.setTimeout(function () {
                        window.location.reload();
                    }, 800);
                    return;
                }

                $button.prop("disabled", false);
            },
            error: function () {
                setMessage("처리 중 오류가 발생했습니다.", false);
                $button.prop("disabled", false);
            }
        });
    }

    function logout() {
        $.ajax({
            url: "/user/logout",
            type: "post",
            dataType: "JSON",
            success: function () {
                JourneyState.clear(sessionStorage);
                window.location.replace("/login.html");
            },
            error: function () {
                setMessage("로그아웃 처리 중 오류가 발생했습니다.", false);
            }
        });
    }

    function goHome() {
        window.location.href = userRole === "GUARDIAN" ? "/guardian-home.html" : "/user-home.html";
    }

    function setMessage(message, success) {
        $("#settingsMessage").text(message || "").toggleClass("error", success === false);
    }
})(jQuery);
