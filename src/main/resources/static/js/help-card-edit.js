/*
 * 도움요청 카드 편집
 *
 * - 기본 문구 2개
 * - 직접 쓴 문구: 저장하면 기본 문구 아래에 카드로 쌓인다 (최대 5개). 카드 안에서 수정·삭제
 * - 맨 아래 '직접입력' 칸에 새 문구를 적고 저장하면 새 카드가 생긴다
 *
 * 고른 문구(helpRequestMessage)는 도움요청 화면에 보이는 문구, 직접 쓴 문구 모음은 따로 저장한다.
 */
(function ($) {
    var MAX_CUSTOM = 5;

    var selectedMessage = "";
    var savedMessage = "";       // 서버에 저장된 '고른 문구'
    var customMessages = [];     // 직접 쓴 문구 모음
    var editingIndex = -1;       // 수정 중인 카드 번호

    $(function () {
        $("#backButton").on("click", goBack);

        // 카드를 누르면 고른다 (카드 안 버튼·입력칸을 누른 것은 빼고)
        $(".preset-list").on("click", ".preset-card", function (event) {
            if ($(event.target).closest("button.card-action, .card-edit-input, .card-edit-actions").length) {
                return;
            }
            selectCard($(this));
        });

        // 직접입력 칸은 키보드로 들어와도 선택되게 한다
        $("#customMessage").on("focus", function () {
            if (!$("#customPresetButton").hasClass("selected")) {
                selectCard($("#customPresetButton"));
            }
        });
        $("#customMessage").on("input", function () {
            if ($("#customPresetButton").hasClass("selected")) {
                selectedMessage = $(this).val();
            }
            fitInput(this);
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
                if (!json.success) {
                    return;
                }

                customMessages = json.customMessages || [];
                savedMessage = json.helpRequestMessage || "";

                // 예전에 직접 써서 고른 문구가 목록에 없으면 카드로 옮겨 둔다
                if (savedMessage && !isPreset(savedMessage) && customMessages.indexOf(savedMessage) < 0
                        && customMessages.length < MAX_CUSTOM) {
                    customMessages.push(savedMessage);
                    saveCustomMessages(customMessages);
                }

                renderCustomCards();
                selectByMessage(savedMessage);
            }
        });
    }

    /* ---------------------------- 직접 쓴 문구 카드 ---------------------------- */

    function renderCustomCards() {
        $(".saved-card").remove();
        var $input = $("#customPresetButton");

        $.each(customMessages, function (index, message) {
            var $card = $("<div>")
                    .addClass("preset-card saved-card")
                    .attr("role", "radio")
                    .attr("aria-checked", "false")
                    .attr("tabindex", "0")
                    .data("message", message)
                    .data("index", index);

            if (index === editingIndex) {
                $card.addClass("editing").append(editForm(index, message));
            } else {
                $card.append($("<p>").addClass("saved-text").text(message))
                        .append($("<div>").addClass("card-actions")
                                .append(actionButton("수정", "", function () {
                                    editingIndex = index;
                                    renderCustomCards();
                                    selectByMessage(selectedMessage);
                                    $(".card-edit-input").trigger("focus");
                                }))
                                .append(actionButton("삭제", "danger", function () {
                                    deleteCustom(index);
                                })));
            }

            $card.on("keydown", function (event) {
                if ((event.key === "Enter" || event.key === " ") && event.target === this) {
                    event.preventDefault();
                    selectCard($card);
                }
            });

            $input.before($card);
        });

        // 다 차면 새로 적는 칸 대신 안내
        var full = customMessages.length >= MAX_CUSTOM;
        $input.toggleClass("hidden", full);
        $("#customFullNote").toggleClass("hidden", !full);
    }

    function actionButton(text, extraClass, onClick) {
        return $("<button>")
                .attr("type", "button")
                .addClass("card-action " + extraClass)
                .text(text)
                .on("click", function (event) {
                    event.stopPropagation();
                    onClick();
                });
    }

    /** 카드 안에서 바로 고치는 칸 */
    function editForm(index, message) {
        var $input = $("<textarea>")
                .addClass("card-edit-input")
                .attr("maxlength", "500")
                .attr("rows", "1")
                .attr("aria-label", "문구 수정")
                .val(message)
                .on("input", function () {
                    fitInput(this);
                });

        window.setTimeout(function () {
            fitInput($input[0]);
        }, 0);

        return $("<div>").addClass("card-edit")
                .append($input)
                .append($("<div>").addClass("card-edit-actions")
                        .append(actionButton("취소", "", function () {
                            editingIndex = -1;
                            renderCustomCards();
                            selectByMessage(selectedMessage);
                        }))
                        .append(actionButton("완료", "primary", function () {
                            finishEdit(index, $input.val());
                        })));
    }

    function finishEdit(index, value) {
        var text = (value || "").trim();
        if (!text) {
            setMessage("문구를 입력해주세요.", false);
            return;
        }

        var old = customMessages[index];
        var next = customMessages.slice();
        next[index] = text;

        saveCustomMessages(next, function () {
            editingIndex = -1;
            // 고쳐진 문구를 고르고 있었으면 고친 문구로 이어서 고른다
            if (selectedMessage === old) {
                selectedMessage = text;
            }
            renderCustomCards();
            selectByMessage(selectedMessage);
            // 도움요청 화면에 보이던 문구였으면 그것도 고친 문구로 바꾼다
            if (savedMessage === old) {
                saveSelected(text, false);
            }
            setMessage("문구를 고쳤어요.", true);
        });
    }

    function deleteCustom(index) {
        var message = customMessages[index];

        AppConfirm("이 문구를 지울까요?", "삭제", true).then(function (ok) {
            if (!ok) {
                return;
            }

            var next = customMessages.slice();
            next.splice(index, 1);

            saveCustomMessages(next, function () {
                editingIndex = -1;
                renderCustomCards();

                // 지운 문구를 고르고 있었으면 첫 번째 기본 문구로
                if (selectedMessage === message) {
                    selectedMessage = $(".preset-card").first().data("message") || "";
                }
                selectByMessage(selectedMessage);

                // 도움요청 화면에 보이던 문구였으면 첫 번째 기본 문구로 바꿔 둔다
                if (savedMessage === message) {
                    saveSelected($(".preset-card").first().data("message"), false);
                }
                setMessage("문구를 지웠어요.", true);
            });
        });
    }

    /** 직접 쓴 문구 모음을 통째로 저장 */
    function saveCustomMessages(next, done) {
        $.ajax({
            url: "/user/help-card/messages",
            type: "post",
            dataType: "JSON",
            data: { messages: JSON.stringify(next) },
            success: function (json) {
                if (!json.success) {
                    setMessage(json.message || "문구를 저장하지 못했어요.", false);
                    return;
                }
                customMessages = json.customMessages || [];
                if (done) {
                    done();
                }
            },
            error: function () {
                setMessage("문구 저장 중 오류가 발생했어요.", false);
            }
        });
    }

    /* ---------------------------- 고르기 ---------------------------- */

    function isPreset(message) {
        var found = false;
        $(".preset-card:not(.saved-card):not(.custom-card)").each(function () {
            if (($(this).data("message") || "") === message) {
                found = true;
                return false;
            }
            return true;
        });
        return found;
    }

    function selectByMessage(message) {
        var $match = $(".preset-card").filter(function () {
            return !$(this).hasClass("custom-card") && ($(this).data("message") || "") === message;
        }).first();

        if ($match.length) {
            markSelected($match);
            selectedMessage = message;
        } else {
            markSelected($(".preset-card").first());
            selectedMessage = $(".preset-card").first().data("message") || "";
        }
    }

    function selectCard($card) {
        markSelected($card);

        if ($card.attr("id") === "customPresetButton") {
            selectedMessage = $("#customMessage").val();
            if (document.activeElement !== $("#customMessage")[0]) {
                $("#customMessage").trigger("focus");
            }
        } else {
            selectedMessage = $card.data("message") || "";
        }
        setMessage("");
    }

    function markSelected($card) {
        $(".preset-card").removeClass("selected").attr("aria-checked", "false");
        $card.addClass("selected").attr("aria-checked", "true");
    }

    /** 적는 만큼 칸이 늘어나게 한다 */
    function fitInput(input) {
        if (!input) {
            return;
        }
        input.style.height = "auto";
        input.style.height = input.scrollHeight + "px";
    }

    /* ---------------------------- 저장 ---------------------------- */

    function saveHelpCard() {
        var writingNew = $("#customPresetButton").hasClass("selected");
        var message = (writingNew ? $("#customMessage").val() : selectedMessage) || "";
        message = message.trim();

        if (!message) {
            setMessage("도움요청 문구를 입력해주세요.", false);
            return;
        }

        // 새로 적은 문구: 카드로 쌓고 그 카드를 고른 채로 이 화면에 남는다
        if (writingNew && !isPreset(message)) {
            if (customMessages.indexOf(message) < 0 && customMessages.length >= MAX_CUSTOM) {
                setMessage("직접 쓴 문구는 " + MAX_CUSTOM + "개까지 저장할 수 있어요. 안 쓰는 카드를 지워주세요.", false);
                return;
            }

            var next = customMessages.indexOf(message) < 0 ? customMessages.concat([message]) : customMessages;
            $("#saveButton").prop("disabled", true);
            saveCustomMessages(next, function () {
                $("#customMessage").val("");
                fitInput($("#customMessage")[0]);
                renderCustomCards();
                selectByMessage(message);
                saveSelected(message, false, function () {
                    setMessage("저장했어요. 아래 카드에서 고치거나 지울 수 있어요.", true);
                });
            });
            return;
        }

        saveSelected(message, true);
    }

    /**
     * 도움요청 화면에 보일 문구 저장
     * @param showSaved true면 '저장했어요'를 보여준다
     */
    function saveSelected(message, showSaved, done) {
        $("#saveButton").prop("disabled", true);
        $.ajax({
            url: "/user/help-card",
            type: "post",
            dataType: "JSON",
            data: { helpRequestMessage: message },
            success: function (json) {
                $("#saveButton").prop("disabled", false);
                if (!json.success) {
                    setMessage(json.message || "저장하지 못했어요.", false);
                    return;
                }

                savedMessage = message;
                if (done) {
                    done();
                }
                // 저장해도 이 화면에 그대로 남는다 (도움요청 화면으로 넘어가지 않음)
                if (showSaved) {
                    setMessage("저장했어요.", true);
                }
            },
            error: function () {
                $("#saveButton").prop("disabled", false);
                setMessage("저장 중 오류가 발생했어요.", false);
            }
        });
    }

    function setMessage(message, success) {
        $("#editMessage").text(message || "").toggleClass("error", success === false);
    }

    function goBack() {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }

        window.location.href = "/help-request.html";
    }
})(jQuery);
