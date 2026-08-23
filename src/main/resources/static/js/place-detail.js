(function ($) {
    var selectedDestination = null;
    var favorite = false;

    $(function () {
        checkSession();

        $("#backButton").on("click", function () {
            window.location.href = "/route-search.html";
        });

        $("#favoriteButton").on("click", function () {
            toggleFavorite();
        });

        $("#confirmDestinationButton").on("click", function () {
            requestCurrentOrigin();
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

                if (json.userRole !== "USER") {
                    window.location.replace("/guardian-home.html");
                    return;
                }

                loadSelectedDestination();
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    function loadSelectedDestination() {
        var rawDestination = sessionStorage.getItem("selectedDestination");

        if (!rawDestination) {
            window.location.replace("/route-search.html");
            return;
        }

        try {
            selectedDestination = JSON.parse(rawDestination);
        } catch (e) {
            sessionStorage.removeItem("selectedDestination");
            window.location.replace("/route-search.html");
            return;
        }

        if (!selectedDestination || !selectedDestination.placeName) {
            window.location.replace("/route-search.html");
            return;
        }

        selectedDestination = normalizePlace(selectedDestination);
        renderDestination(selectedDestination);
        $("#placeDetailPage").removeClass("hidden");
        checkFavorite();
    }

    function renderDestination(place) {
        var address = place.roadAddressName || place.addressName || "주소 정보 없음";

        $("#headerPlaceName").text(place.placeName);
        $("#placeName").text(place.placeName);
        $("#placeAddress").text(address);

        if (place.categoryName) {
            $("#placeCategory").text(place.categoryName).removeClass("hidden");
        }

        if (place.phone) {
            $("#placePhone").text(place.phone).removeClass("hidden");
        }
    }

    function checkFavorite() {
        if (!selectedDestination.id) {
            renderFavorite(false);
            return;
        }

        $.ajax({
            url: "/place/favorites/check",
            type: "GET",
            dataType: "JSON",
            data: {
                placeId: selectedDestination.id
            },
            success: function (json) {
                renderFavorite(!!(json.success && json.favorite));
            },
            error: function () {
                renderFavorite(false);
            }
        });
    }

    function toggleFavorite() {
        if (!selectedDestination || !selectedDestination.id) {
            setMessage("선택한 장소 정보를 확인할 수 없습니다.");
            return;
        }

        $("#favoriteButton").prop("disabled", true);

        if (favorite) {
            deleteFavorite();
        } else {
            addFavorite();
        }
    }

    function addFavorite() {
        $.ajax({
            url: "/place/favorites",
            type: "POST",
            dataType: "JSON",
            data: toPlaceRequest(selectedDestination),
            success: function (json) {
                if (!json.success) {
                    setMessage(json.message || "즐겨찾기 저장 중 오류가 발생했습니다.");
                    return;
                }

                renderFavorite(true);
                setMessage(json.message || "자주 가는 곳에 저장했습니다.");
            },
            error: function () {
                setMessage("즐겨찾기 저장 중 오류가 발생했습니다.");
            },
            complete: function () {
                $("#favoriteButton").prop("disabled", false);
            }
        });
    }

    function deleteFavorite() {
        $.ajax({
            url: "/place/favorites/delete",
            type: "POST",
            dataType: "JSON",
            data: {
                placeId: selectedDestination.id
            },
            success: function (json) {
                if (!json.success) {
                    setMessage(json.message || "즐겨찾기 삭제 중 오류가 발생했습니다.");
                    return;
                }

                renderFavorite(false);
                setMessage(json.message || "자주 가는 곳에서 삭제했습니다.");
            },
            error: function () {
                setMessage("즐겨찾기 삭제 중 오류가 발생했습니다.");
            },
            complete: function () {
                $("#favoriteButton").prop("disabled", false);
            }
        });
    }

    function renderFavorite(isFavorite) {
        favorite = isFavorite;
        $("#favoriteButton")
                .attr("aria-pressed", String(favorite))
                .text(favorite ? "★ 즐겨찾기" : "☆ 즐겨찾기");
    }

    function requestCurrentOrigin() {
        if (!hasSelectedDestination()) {
            setMessage("선택한 목적지가 없습니다.");
            setTimeout(function () {
                window.location.href = "/route-search.html";
            }, 800);
            return;
        }

        if (!navigator.geolocation) {
            setMessage("현재 위치를 확인할 수 없는 브라우저입니다.");
            return;
        }

        setLoading(true);
        setMessage("현재 위치 확인 중...");

        navigator.geolocation.getCurrentPosition(
                function (position) {
                    var currentOrigin = {
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                        accuracy: position.coords.accuracy,
                        capturedAt: Date.now()
                    };

                    sessionStorage.setItem("currentOrigin", JSON.stringify(currentOrigin));
                    searchRoutes(currentOrigin);
                },
                function (error) {
                    setMessage(getGeolocationErrorMessage(error));
                    setLoading(false);
                },
                {
                    enableHighAccuracy: true,
                    timeout: 15000,
                    maximumAge: 0
                }
        );
    }

    function searchRoutes(currentOrigin) {
        setMessage("경로 찾는 중...");

        $.ajax({
            url: "/map/routes",
            type: "GET",
            dataType: "JSON",
            data: {
                startLongitude: currentOrigin.longitude,
                startLatitude: currentOrigin.latitude,
                endLongitude: selectedDestination.longitude,
                endLatitude: selectedDestination.latitude,
                destinationName: selectedDestination.placeName
            },
            success: function (json) {
                if (!json.success) {
                    setMessage(json.message || "경로 검색 중 오류가 발생했습니다.");
                    return;
                }

                sessionStorage.setItem("routeSearchResult", JSON.stringify(json));
                setMessage(createRouteSummaryMessage(json));
                window.location.href = "/route-compare.html";
            },
            error: function () {
                setMessage("경로 검색 중 오류가 발생했습니다.");
            },
            complete: function () {
                setLoading(false);
            }
        });
    }

    function createRouteSummaryMessage(routeResult) {
        var publicTransitCount = routeResult.publicTransit && routeResult.publicTransit.routes
                ? routeResult.publicTransit.routes.length : 0;
        var walkingAvailable = routeResult.walking && routeResult.walking.available;

        if (publicTransitCount > 0 && walkingAvailable) {
            return "경로를 찾았습니다. 대중교통 경로 " + publicTransitCount + "개와 도보 경로를 확인했습니다.";
        }

        if (publicTransitCount > 0) {
            return "경로를 찾았습니다. 대중교통 경로 " + publicTransitCount + "개를 확인했습니다.";
        }

        if (walkingAvailable) {
            return "경로를 찾았습니다. 도보 경로를 확인했습니다.";
        }

        return routeResult.message || "이동 가능한 경로를 찾지 못했습니다.";
    }

    function hasSelectedDestination() {
        var rawDestination = sessionStorage.getItem("selectedDestination");

        return !!rawDestination
                && !!selectedDestination
                && !!selectedDestination.longitude
                && !!selectedDestination.latitude;
    }

    function getGeolocationErrorMessage(error) {
        if (!error) {
            return "현재 위치를 확인하는 중 오류가 발생했습니다.";
        }

        if (error.code === error.PERMISSION_DENIED) {
            return "현재 위치 권한이 필요합니다. 브라우저에서 위치 권한을 허용해주세요.";
        }

        if (error.code === error.POSITION_UNAVAILABLE) {
            return "현재 위치를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.";
        }

        if (error.code === error.TIMEOUT) {
            return "현재 위치 확인 시간이 초과되었습니다. 다시 시도해주세요.";
        }

        return "현재 위치를 확인하는 중 오류가 발생했습니다.";
    }

    function normalizePlace(place) {
        return {
            id: value(place.id || place.kakaoPlaceId),
            placeName: value(place.placeName),
            categoryName: value(place.categoryName),
            addressName: value(place.addressName || place.address),
            roadAddressName: value(place.roadAddressName || place.roadAddress),
            longitude: value(place.longitude || place.lng),
            latitude: value(place.latitude || place.lat),
            phone: value(place.phone),
            placeUrl: value(place.placeUrl)
        };
    }

    function toPlaceRequest(place) {
        return {
            placeId: place.id,
            placeName: place.placeName,
            categoryName: place.categoryName,
            addressName: place.addressName,
            roadAddressName: place.roadAddressName,
            longitude: place.longitude,
            latitude: place.latitude,
            phone: place.phone,
            placeUrl: place.placeUrl
        };
    }

    function value(source) {
        return source == null ? "" : String(source);
    }

    function setLoading(isLoading) {
        $("#confirmDestinationButton")
                .prop("disabled", isLoading)
                .text(isLoading ? "현재 위치 확인 중..." : "이곳으로 가기");
    }

    function setMessage(message) {
        $("#detailMessage").text(message);
    }
})(jQuery);
