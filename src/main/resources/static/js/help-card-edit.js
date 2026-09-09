(function ($) {
    var selectedMessage = "";
    var customSelected = false;

    $(function () {
        $("#backButton").on("click", goBack);
        $(".preset-card").on("click", function () {
            selectPreset($(this));
        });
        $("#saveButton").on("click", saveHelpCard);

        checkSession();
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

                if (json.userRole !== "USER") {
                    window.location.replace("/guardian-home.html");
                    return;
                }

                $("#helpCardEditPage").removeClass("hidden");
                selectedMessage = $(".preset-card.selected").data("message") || "";
                loadHelpCard();
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    function loadHelpCard() {
        $.ajax({
            url: "/user/help-card",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success || !json.helpRequestMessage) {
                    return;
                }

                var savedMessage = json.helpRequestMessage;
                var matched = false;
                $(".preset-card").each(function () {
                    var $button = $(this);
                    if (($button.data("message") || "") === savedMessage) {
                        selectPreset($button);
                        matched = true;
                        return false;
                    }
                    return true;
                });

                if (!matched) {
                    $("#customMessage").val(savedMessage);
                    selectPreset($("#customPresetButton"));
                }
            }
        });
    }

    function selectPreset($button) {
        $(".preset-card").removeClass("selected").attr("aria-checked", "false");
        $button.addClass("selected").attr("aria-checked", "true");

        customSelected = $button.attr("id") === "customPresetButton";
        $("#customBox").toggleClass("hidden", !customSelected);
        selectedMessage = customSelected ? $("#customMessage").val() : ($button.data("message") || "");
        $("#editMessage").text("");

        if (customSelected) {
            $("#customMessage").trigger("focus");
        }
    }

    $("#customMessage").on("input", function () {
        if (customSelected) {
            selectedMessage = $(this).val();
        }
    });

    function saveHelpCard() {
        var message = customSelected ? $("#customMessage").val() : selectedMessage;
        message = message ? message.trim() : "";

        if (!message) {
            $("#editMessage").text("도움요청 문구를 입력해주세요.");
            return;
        }

        $("#saveButton").prop("disabled", true);
        $.ajax({
            url: "/user/help-card",
            type: "post",
            dataType: "JSON",
            data: {
                helpRequestMessage: message
            },
            success: function (json) {
                $("#saveButton").prop("disabled", false);
                if (!json.success) {
                    $("#editMessage").text(json.message || "저장하지 못했어요.");
                    return;
                }

                $("#editMessage").text("저장했어요.");
                window.setTimeout(function () {
                    window.location.href = "/help-request.html";
                }, 450);
            },
            error: function () {
                $("#saveButton").prop("disabled", false);
                $("#editMessage").text("저장 중 오류가 발생했어요.");
            }
        });
    }

    function goBack() {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }

        window.location.href = "/help-request.html";
    }
})(jQuery);
