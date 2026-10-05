(function ($) {

    var LOCATION_TIMEOUT = 10000;

    // 구간당 사진은 3장까지. 들어오자마자 그 수만큼 빈 칸을 보여준다.
    var DEFAULT_SLOTS = 3;

    var routeStepId = null;
    var routeId = null;
    var photos = [];
    var maxPhotos = DEFAULT_SLOTS;

    // 사진을 새로 찍는 중인지, 기존 사진을 바꾸는 중인지
    var replacingPhotoId = null;

    // 지도를 눌러 위치를 옮기는 중인 사진
    var pickingPhotoId = null;

    // 사진 위치가 없을 때 지도를 맞출 기준
    var stepLat = null;
    var stepLng = null;

    var map = null;
    var markers = [];

    $(function () {
        routeStepId = new URLSearchParams(window.location.search).get("stepId");

        if (!routeStepId) {
            window.location.replace("/route-manage.html");
            return;
        }

        checkSession();

        $("#backButton").on("click", function () {
            goBack();
        });

        $("#photoInput").on("change", function () {
            var file = this.files && this.files[0];

            if (file) {
                takePhoto(file);
            }

            // 같은 사진을 다시 고를 수 있게 비워둔다
            this.value = "";
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

                if (json.userRole !== "GUARDIAN") {
                    window.location.replace("/user-home.html");
                    return;
                }

                $("#photoPage").removeClass("hidden");
                loadPhotos();
            },
            error: function () {
                window.location.replace("/login.html");
            }
        });
    }

    function goBack() {
        window.location.href = routeId
                ? "/route-record.html?id=" + routeId
                : "/route-manage.html";
    }

    /* ---------------------------- 조회 ---------------------------- */

    function loadPhotos() {
        $.ajax({
            url: "/route/steps/" + routeStepId + "/photos",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json.success) {
                    setMessage(json.message, false);
                    return;
                }

                routeId = json.routeId;
                photos = json.photos || [];

                $("#stepTitle").text(json.stepTitle || "구간");
                maxPhotos = json.maxPhotos || DEFAULT_SLOTS;
                stepLat = json.stepLat;
                stepLng = json.stepLng;
                $("#photoCount").text(buildCountText(maxPhotos));


                render();
                showMap();
            },
            error: function () {
                setMessage("사진을 불러오는 중 오류가 발생했습니다.", false);
            }
        });
    }

    /**
     * "3/3 등록 완료" — 찍은 사진 중 설명까지 채운 장수.
     * 사진만 찍고 설명을 안 적으면 이용자가 보고도 뭘 해야 할지 모른다.
     */
    function buildCountText(limit) {
        if (!photos.length) {
            return "최대 " + limit + "장까지 찍을 수 있어요";
        }

        var described = photos.filter(function (photo) {
            return photo.title && photo.description;
        }).length;

        return described + "/" + photos.length
                + (described === photos.length ? " 등록 완료" : " 등록 · 설명을 채워주세요");
    }

    /**
     * 사진이 없어도 빈 칸을 미리 깔아둔다.
     * 들어오자마자 어디를 눌러 사진을 넣는지 바로 보이게 하려는 것이다.
     * 칸을 다 채우면 다음 칸이 하나 더 생기고, 최대 장수까지만 늘어난다.
     */
    function render() {
        var $list = $("#photoCards").empty();
        var slotCount = Math.min(maxPhotos, Math.max(DEFAULT_SLOTS, photos.length + 1));

        for (var index = 0; index < slotCount; index++) {
            $list.append(index < photos.length
                    ? createCard(photos[index], index + 1)
                    : createEmptySlot(index + 1));
        }
    }

    /** 아직 사진이 없는 칸. 누르면 바로 사진을 고를 수 있다. */
    function createEmptySlot(number) {
        return $("<li>")
                .addClass("photo-card empty")
                .append($("<span>").addClass("photo-number").text(number))
                .append($("<div>").addClass("photo-blank").text("＋"))
                .append($("<div>")
                        .addClass("photo-text")
                        .append($("<strong>").text("사진 추가"))
                        .append($("<p>").text("헷갈리기 쉬운 곳을 찍어주세요")))
                .on("click", function () {
                    replacingPhotoId = null;
                    $("#photoInput").trigger("click");
                });
    }

    function createCard(photo, number) {
        // 제목·설명은 버튼 대신 옆의 연필로 고친다. 버튼이 너무 많아지지 않게.
        var $pencil = $("<button>")
                .attr("type", "button")
                .addClass("photo-edit")
                .attr("aria-label", "설명 수정")
                .html('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"'
                        + ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
                        + '<path d="M12 20h9"/>'
                        + '<path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'
                        + "</svg>")
                .on("click", function () {
                    editText(photo);
                });

        var $text = $("<div>")
                .addClass("photo-text")
                .append($("<strong>").text(photo.title || "이름 없는 지점"))
                .append($("<p>")
                        .addClass("photo-desc")
                        .text(photo.description || "설명을 추가해주세요")
                        .append($pencil));

        var $buttons = $("<div>")
                .addClass("photo-actions")
                .append($("<button>")
                        .attr("type", "button")
                        .addClass("photo-action")
                        .text("재촬영")
                        .on("click", function () {
                            replacingPhotoId = photo.routePhotoId;
                            $("#photoInput").trigger("click");
                        }))
                .append($("<button>")
                        .attr("type", "button")
                        .addClass("photo-action")
                        .text("위치 수정")
                        .on("click", function () {
                            startPickingLocation(photo);
                        }))
                .append($("<button>")
                        .attr("type", "button")
                        .addClass("photo-action danger")
                        .text("삭제")
                        .on("click", function () {
                            if (window.confirm("이 사진을 지울까요?")) {
                                deletePhoto(photo.routePhotoId);
                            }
                        }));

        $text.append($buttons);

        return $("<li>")
                .addClass("photo-card")
                .append($("<span>").addClass("photo-number").text(number))
                .append($("<img>").attr("src", photo.photoUrl).attr("alt", photo.title || "경로 사진"))
                .append($text);
    }

    /* ---------------------------- 사진 ---------------------------- */

    /**
     * 사진을 찍은 자리를 지도에 표시하려고 위치도 같이 보낸다.
     * 위치 권한이 없어도 사진은 올라간다. 지도에만 안 찍힐 뿐이다.
     */
    function takePhoto(file) {
        setMessage("사진을 올리는 중이에요...", true);

        if (!navigator.geolocation) {
            uploadPhoto(file, null);
            return;
        }

        navigator.geolocation.getCurrentPosition(
                function (position) {
                    uploadPhoto(file, position.coords);
                },
                function () {
                    uploadPhoto(file, null);
                },
                { enableHighAccuracy: true, timeout: LOCATION_TIMEOUT, maximumAge: 0 });
    }

    function uploadPhoto(file, coords) {
        var formData = new FormData();
        formData.append("photo", file);

        if (coords) {
            formData.append("latitude", coords.latitude);
            formData.append("longitude", coords.longitude);
        }

        var url = replacingPhotoId
                ? "/route/photos/" + replacingPhotoId + "/replace"
                : "/route/steps/" + routeStepId + "/photos";

        $.ajax({
            url: url,
            type: "post",
            dataType: "JSON",
            data: formData,
            processData: false,
            contentType: false,
            success: function (json) {
                setMessage(json.message, json.success);
                replacingPhotoId = null;

                if (json.success) {
                    loadPhotos();
                }
            },
            error: function () {
                setMessage("사진을 올리지 못했어요.", false);
                replacingPhotoId = null;
            }
        });
    }

    function editText(photo) {
        var title = window.prompt("이 지점의 이름을 적어주세요", photo.title || "");

        if (title === null) {
            return;
        }

        var description = window.prompt("여기서 무엇을 하면 되나요?", photo.description || "");

        if (description === null) {
            return;
        }

        $.ajax({
            url: "/route/photos/" + photo.routePhotoId + "/text",
            type: "post",
            dataType: "JSON",
            data: { title: title, description: description },
            success: function (json) {
                setMessage(json.message, json.success);

                if (json.success) {
                    loadPhotos();
                }
            },
            error: function () {
                setMessage("설명을 저장하지 못했어요.", false);
            }
        });
    }

    /* ---------------------------- 위치 수정 ---------------------------- */

    /**
     * 지도를 눌러 사진 위치를 옮기는 모드로 들어간다.
     * 현장에서 찍으면 GPS로 자동으로 들어가지만,
     * 집에서 미리 만들면 엉뚱한 자리에 찍히기 때문에 손으로 옮길 수 있어야 한다.
     */
    function startPickingLocation(photo) {
        pickingPhotoId = photo.routePhotoId;

        $("#photoPage").addClass("picking");
        setMessage("지도에서 이 사진의 위치를 눌러주세요.", true);

        // 지도가 화면 위쪽에 있어 바로 보이게 올려준다
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function stopPickingLocation() {
        pickingPhotoId = null;
        $("#photoPage").removeClass("picking");
    }

    function savePickedLocation(latlng) {
        $.ajax({
            url: "/route/photos/" + pickingPhotoId + "/location",
            type: "post",
            dataType: "JSON",
            data: { latitude: latlng.getLat(), longitude: latlng.getLng() },
            success: function (json) {
                setMessage(json.message, json.success);
                stopPickingLocation();

                if (json.success) {
                    loadPhotos();
                }
            },
            error: function () {
                setMessage("위치를 옮기지 못했어요.", false);
                stopPickingLocation();
            }
        });
    }

    function deletePhoto(routePhotoId) {
        $.ajax({
            url: "/route/photos/" + routePhotoId + "/delete",
            type: "post",
            dataType: "JSON",
            success: function (json) {
                setMessage(json.message, json.success);

                if (json.success) {
                    loadPhotos();
                }
            },
            error: function () {
                setMessage("사진을 지우지 못했어요.", false);
            }
        });
    }

    /* ---------------------------- 지도 ---------------------------- */

    /** 사진을 찍은 자리에 번호를 찍어 어디서 찍었는지 보여준다 */
    /**
     * 사진에 위치가 아직 없어도 지도는 띄운다.
     * 지도를 눌러 위치를 지정할 수 있어야 하기 때문이다.
     */
    function showMap() {
        var located = photos.filter(function (photo) {
            return photo.lat && photo.lng;
        });

        $.ajax({
            url: "/map/config",
            type: "get",
            dataType: "JSON",
            success: function (json) {
                if (!json || !json.success || !json.available || !json.javascriptKey) {
                    setMapMessage("지도를 사용할 수 없어요");
                    return;
                }

                loadKakaoMap(json.javascriptKey, located);
            },
            error: function () {
                setMapMessage("지도를 불러오지 못했어요");
            }
        });
    }

    function loadKakaoMap(javascriptKey, located) {
        if (window.kakao && window.kakao.maps) {
            window.kakao.maps.load(function () {
                drawMap(located);
            });
            return;
        }

        var script = document.createElement("script");
        script.src = "https://dapi.kakao.com/v2/maps/sdk.js?appkey="
                + encodeURIComponent(javascriptKey)
                + "&autoload=false";
        script.async = true;

        script.onload = function () {
            window.kakao.maps.load(function () {
                drawMap(located);
            });
        };

        script.onerror = function () {
            setMapMessage("지도를 불러오지 못했어요");
        };

        document.head.appendChild(script);
    }

    function drawMap(located) {
        var mapArea = document.getElementById("photoMap");

        if (!mapArea) {
            return;
        }

        $("#mapMessage").remove();

        if (map === null) {
            map = new window.kakao.maps.Map(mapArea, {
                center: getMapCenter(located),
                level: 4
            });

            // 위치 수정 중일 때만 누른 자리를 사진 위치로 저장한다
            window.kakao.maps.event.addListener(map, "click", function (mouseEvent) {
                if (pickingPhotoId !== null) {
                    savePickedLocation(mouseEvent.latLng);
                }
            });
        }

        $.each(markers, function (index, marker) {
            marker.setMap(null);
        });
        markers = [];

        if (!located.length) {
            return;
        }

        var bounds = new window.kakao.maps.LatLngBounds();

        $.each(located, function (index, photo) {
            var position = new window.kakao.maps.LatLng(photo.lat, photo.lng);

            // 목록의 번호와 지도의 번호가 같아야 어디 사진인지 안다
            var marker = new window.kakao.maps.CustomOverlay({
                map: map,
                position: position,
                content: '<span class="map-pin">' + (index + 1) + "</span>",
                yAnchor: 0.5
            });

            markers.push(marker);
            bounds.extend(position);
        });

        map.setBounds(bounds);
    }

    /**
     * 지도를 어디에 맞출지 고른다.
     * 사진 위치 -> 구간 위치 순으로 보고, 둘 다 없으면 서울 시청을 쓴다.
     */
    function getMapCenter(located) {
        if (located.length) {
            return new window.kakao.maps.LatLng(located[0].lat, located[0].lng);
        }

        if (stepLat && stepLng) {
            return new window.kakao.maps.LatLng(stepLat, stepLng);
        }

        return new window.kakao.maps.LatLng(37.5665, 126.9780);
    }

    function setMapMessage(message) {
        $("#mapMessage").text(message);
    }

    function setMessage(message, success) {
        $("#photoMessage").text(message || "").toggleClass("error", success === false);
    }
})(jQuery);
