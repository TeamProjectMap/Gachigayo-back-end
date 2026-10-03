(function ($) {
    var DEFAULT_HELP_MESSAGE = "저는 발달장애가 있으며\n혼자 이동하다 헤매고 있습니다\n아래 목적지까지 갈 수 있도록 도와주세요";
    var NAVIGATION_ENTRY_KEY = "helpRequestEntryFromNavigation";
    var HELP_REQUEST_STATE_KEY = "currentHelpRequestState";
    var HELP_REQUEST_STATE_TTL_MS = 10 * 60 * 1000;
    var ROUTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

    var helpMessage = DEFAULT_HELP_MESSAGE;
    var currentPosition = null;
    var destination = null;
    var guardianPhone = "";
    var safetyCenterPhone = "";
    var requestCreated = false;

    $(function () {
        $("#backButton").on("click", goBack);
        $("#guardianCallButton").on("click", openGuardianModal);
        $("#safetyCenterButton").on("click", searchSafetyCenter);
        $("#confirmGuardianCallButton").on("click", function () {
            callPhone(guardianPhone);
        });
        $("#confirmSafetyCenterCallButton").on("click", function () {
            callPhone(safetyCenterPhone);
        });
        $("[data-close-modal], .modal-backdrop").on("click", function (event) {
            if (event.target === this) {
                closeModals();
            }
        });

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

                $("#helpRequestPage").removeClass("hidden");
                destination = getCurrentDestination();
                renderDestination(destination);
                loadHelpCard().always(function () {
                    loadGuardianContact();
                    requestCurrentPosition();
                });
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    function loadHelpCard() {
        return $.ajax({
            url: "/user/help-card",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (json.success && json.helpRequestMessage) {
                    helpMessage = json.helpRequestMessage;
                    renderHelpMessage(helpMessage);
                } else {
                    renderHelpMessage(DEFAULT_HELP_MESSAGE);
                }
            },
            error: function () {
                renderHelpMessage(DEFAULT_HELP_MESSAGE);
            }
        });
    }

    function loadGuardianContact() {
        $.ajax({
            url: "/help-request/guardian-contact",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success || !json.guardianLinked) {
                    setGuardianUnavailable("연결된 보호자 연락처가 없어요");
                    return;
                }

                guardianPhone = json.guardianPhone || "";
                if (!guardianPhone) {
                    setGuardianUnavailable("연결된 보호자 연락처가 없어요");
                    return;
                }

                $("#guardianCallButton").prop("disabled", false);
                $("#guardianContactMessage").text((json.guardianName || "보호자") + "에게 전화할 수 있어요");
            },
            error: function () {
                setGuardianUnavailable("보호자 연락처를 확인하지 못했어요");
            }
        });
    }

    function requestCurrentPosition() {
        if (!navigator.geolocation) {
            handleGpsFailure();
            return;
        }

        navigator.geolocation.getCurrentPosition(function (position) {
            currentPosition = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy
            };
            $("#safetyCenterButton").prop("disabled", false);
            $("#safetyCenterMessage").text("가까운 안전센터를 찾을 수 있어요");
            createHelpRequest();
        }, function () {
            handleGpsFailure();
        }, {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 60000
        });
    }

    function handleGpsFailure() {
        currentPosition = null;
        $("#safetyCenterButton").prop("disabled", true);
        $("#safetyCenterMessage").text("현재 위치를 확인할 수 없어 가까운 안전센터를 찾을 수 없어요");
        createHelpRequest();
    }

    function createHelpRequest() {
        if (requestCreated) {
            return;
        }
        requestCreated = true;

        var requestKey = getHelpRequestKey();
        setStatus("도움 요청을 전송하고 있어요", "잠시만 기다려주세요");

        $.ajax({
            url: "/help-request",
            type: "post",
            dataType: "JSON",
            data: {
                helpMessage: helpMessage,
                destinationName: destination ? destination.placeName : "",
                destinationLatitude: destination ? destination.latitude : "",
                destinationLongitude: destination ? destination.longitude : "",
                currentLatitude: currentPosition ? currentPosition.latitude : "",
                currentLongitude: currentPosition ? currentPosition.longitude : "",
                accuracy: currentPosition ? currentPosition.accuracy : "",
                clientRequestKey: requestKey
            },
            success: function (json) {
                if (!json.success) {
                    setStatus("도움 요청을 전송하지 못했어요", json.message || "잠시 후 다시 시도해주세요");
                    return;
                }

                saveHelpRequestState(requestKey, json.helpRequestId);
                if (json.guardianLinked && json.locationSaved) {
                    setStatus("보호자에게 현재 위치를 보냈어요", "방금 전 · 자동 전송됨");
                    return;
                }

                if (json.guardianLinked) {
                    setStatus("보호자에게 도움 요청을 보냈어요", "현재 위치는 확인하지 못했어요");
                    return;
                }

                setStatus("도움 요청이 저장되었어요", "연결된 보호자가 없어요");
            },
            error: function () {
                setStatus("도움 요청을 전송하지 못했어요", "잠시 후 다시 시도해주세요");
            }
        });
    }

    function searchSafetyCenter() {
        if (!currentPosition) {
            $("#safetyCenterMessage").text("현재 위치를 확인할 수 없어 가까운 안전센터를 찾을 수 없어요");
            return;
        }

        $("#safetyCenterButton").prop("disabled", true);
        $("#safetyCenterMessage").text("가까운 안전센터를 찾고 있어요");

        $.ajax({
            url: "/help-request/nearby-safety-center",
            type: "get",
            dataType: "JSON",
            data: {
                latitude: currentPosition.latitude,
                longitude: currentPosition.longitude
            },
            success: function (json) {
                $("#safetyCenterButton").prop("disabled", false);
                if (!json.success || !json.hasPhone || !json.safetyCenter) {
                    $("#safetyCenterMessage").text(json.message || "가까운 안전센터 연락처를 찾지 못했어요");
                    return;
                }

                openSafetyCenterModal(json.safetyCenter);
                $("#safetyCenterMessage").text("가까운 안전센터를 찾았어요");
            },
            error: function () {
                $("#safetyCenterButton").prop("disabled", false);
                $("#safetyCenterMessage").text("가까운 안전센터 연락처를 찾지 못했어요");
            }
        });
    }

    function openGuardianModal() {
        if (!guardianPhone) {
            setGuardianUnavailable("연결된 보호자 연락처가 없어요");
            return;
        }

        $("#guardianModalPhone").text(guardianPhone);
        $("#guardianCallModal").removeClass("hidden");
    }

    function openSafetyCenterModal(safetyCenter) {
        safetyCenterPhone = safetyCenter.phone || "";
        $("#safetyCenterName").text(safetyCenter.placeName || "안전센터");
        $("#safetyCenterDistance").text(formatDistance(safetyCenter.distance));
        $("#safetyCenterModal").removeClass("hidden");
    }

    function closeModals() {
        $(".modal-backdrop").addClass("hidden");
    }

    function callPhone(phone) {
        if (!phone) {
            return;
        }

        window.location.href = "tel:" + phone.replace(/[^\d+]/g, "");
    }

    function renderHelpMessage(message) {
        $("#helpMessage").html(escapeHtml(message).replace(/\n/g, "<br>"));
    }

    function renderDestination(routeDestination) {
        if (!routeDestination) {
            $("#destinationName").text("현재 설정된 목적지가 없어요");
            return;
        }

        $("#destinationName").text(routeDestination.placeName);
    }

    function getCurrentDestination() {
        var fromNavigation = false;
        try {
            fromNavigation = sessionStorage.getItem(NAVIGATION_ENTRY_KEY) === "true";
        } catch (e) {
            fromNavigation = false;
        }

        if (!fromNavigation) {
            return null;
        }

        var selectedRoute = readJson("selectedRoute");
        if (!selectedRoute || selectedRoute.navigationReady !== true || !selectedRoute.destination) {
            return null;
        }

        if (!selectedRoute.selectedAt || Date.now() - Number(selectedRoute.selectedAt) > ROUTE_MAX_AGE_MS) {
            return null;
        }

        var routeDestination = selectedRoute.destination;
        var placeName = routeDestination.placeName || routeDestination.name || "";
        if (!placeName) {
            return null;
        }

        return {
            placeName: placeName,
            latitude: routeDestination.latitude || "",
            longitude: routeDestination.longitude || ""
        };
    }

    function getHelpRequestKey() {
        var contextKey = destination ? "route:" + destination.placeName + ":" + destination.latitude + ":" + destination.longitude : "home";
        var state = readJson(HELP_REQUEST_STATE_KEY);

        if (state && state.contextKey === contextKey && Date.now() - Number(state.createdAt) < HELP_REQUEST_STATE_TTL_MS) {
            return state.requestKey;
        }

        return "help:" + contextKey + ":" + Date.now() + ":" + Math.random().toString(36).slice(2);
    }

    function saveHelpRequestState(requestKey, helpRequestId) {
        var contextKey = destination ? "route:" + destination.placeName + ":" + destination.latitude + ":" + destination.longitude : "home";
        try {
            sessionStorage.setItem(HELP_REQUEST_STATE_KEY, JSON.stringify({
                contextKey: contextKey,
                requestKey: requestKey,
                helpRequestId: helpRequestId,
                createdAt: Date.now()
            }));
        } catch (e) {
        }
    }

    function setGuardianUnavailable(message) {
        guardianPhone = "";
        $("#guardianCallButton").prop("disabled", true);
        $("#guardianContactMessage").text(message);
    }

    function setStatus(title, detail) {
        $("#statusTitle").text(title);
        $("#statusDetail").text(detail);
    }

    function formatDistance(distance) {
        var meters = Number(distance);
        if (!Number.isFinite(meters)) {
            return "현재 위치 기준 가까운 곳";
        }

        if (meters >= 1000) {
            return "현재 위치에서 약 " + (meters / 1000).toFixed(1) + "km";
        }

        return "현재 위치에서 약 " + Math.round(meters) + "m";
    }

    function goBack() {
        if (window.history.length > 1) {
            window.history.back();
            return;
        }

        window.location.href = "/user-home.html";
    }

    function readJson(key) {
        try {
            var value = sessionStorage.getItem(key);
            return value ? JSON.parse(value) : null;
        } catch (e) {
            return null;
        }
    }

    function escapeHtml(value) {
        return String(value || "")
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#39;");
    }
})(jQuery);
