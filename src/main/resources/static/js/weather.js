// src/main/resources/static/js/weather.js

$(document).ready(function() {
    requestCurrentOrigin();
});

// 위치를 못 가져올 때 쓰는 곳: 마지막으로 확인한 위치, 그것도 없으면 강서구청 근처
var WEATHER_DEFAULT_LOCATION = { lat: 37.5509, lon: 126.8495 };
var WEATHER_LAST_LOCATION_KEY = 'weatherLastLocation';

function requestCurrentOrigin() {
    if (!navigator.geolocation) {
        loadFallbackWeather();
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function (position) {
            var lat = position.coords.latitude, lon = position.coords.longitude;
            try {
                localStorage.setItem(WEATHER_LAST_LOCATION_KEY, JSON.stringify({ lat: lat, lon: lon }));
            } catch (e) { /* 저장 못 해도 날씨는 보여준다 */ }
            loadWeatherData(lat, lon);
        },
        function (error) {
            // 위치 권한이 꺼져 있거나 못 찾아도 날씨 칸이 비지 않게 대신 위치로 보여준다
            console.warn("현재 위치를 몰라 대신 위치로 날씨를 보여줍니다:", error && error.message);
            loadFallbackWeather();
        },
        {
            enableHighAccuracy: false,
            timeout: 8000,
            maximumAge: 10 * 60 * 1000
        }
    );
}

function loadFallbackWeather() {
    var location = WEATHER_DEFAULT_LOCATION;
    try {
        var saved = JSON.parse(localStorage.getItem(WEATHER_LAST_LOCATION_KEY) || 'null');
        if (saved && isFinite(saved.lat) && isFinite(saved.lon)) {
            location = saved;
        }
    } catch (e) { /* 기본 위치 사용 */ }
    loadWeatherData(location.lat, location.lon);
}

function loadWeatherData(lat, lon) {
    $.ajax({
        url: '/weather/getWeather',
        type: 'GET',
        data: { lat: lat, lon: lon },
        dataType: 'json',
        success: function(response) {
            // 기상청 백엔드(WeatherDTO)에서 받아오는 변수
            const temp = response.temp;
            const sky = response.sky; // 1:맑음, 3:구름많음, 4:흐림
            const pty = response.pty; // 0:없음, 1:비, 2:비/눈, 3:눈, 4:소나기

            // 1. 기온 설정
            $('#temperature').text(temp ? temp + '°C' : '-°C');

            // 2. 상태별 문구 및 아이콘 경로 판별
            let mainText = '오늘의 날씨';
            let subText = '좋은 하루 보내세요';
            let iconPath = '/images/weather/weather-sunny.svg';

            // 비나 눈이 오는지(PTY) 먼저 확인
            if (pty && pty !== "0") {
                if (pty === "1" || pty === "4") {
                    mainText = '오늘은 비가 와요';
                    subText = '나갈 때 우산을 챙기세요';
                    iconPath = '/images/weather/weather-pouring.svg';
                } else if (pty === "2") {
                    mainText = '진눈깨비가 내려요';
                    subText = '외출 시 주의하세요';
                    iconPath = '/images/weather/weather-snowy-rainy.svg';
                } else if (pty === "3") {
                    mainText = '오늘은 눈이 와요';
                    subText = '길이 미끄러우니 조심하세요';
                    iconPath = '/images/weather/weather-snowy-heavy.svg';
                }
            }
            // 강수가 없으면 하늘상태(SKY) 확인
            else {
                if (sky === "1") {
                    mainText = '오늘은 맑아요';
                    subText = '외출하기 좋은 날씨예요';
                    iconPath = '/images/weather/weather-sunny.svg';
                } else if (sky === "3") {
                    mainText = '구름이 많아요';
                    subText = '외출 시 참고해주세요';
                    iconPath = '/images/weather/weather-partly-cloudy.svg';
                } else if (sky === "4") {
                    mainText = '오늘은 흐려요';
                    subText = '선선한 날씨예요';
                    iconPath = '/images/weather/weather-cloudy.svg';
                }
            }

            // 3. 화면 DOM 요소 업데이트
            $('#weatherMainText').text(mainText);
            $('#weatherSubText').text(subText);
            $('#weatherIcon').attr('src', iconPath);
        },
        error: function(xhr, status, error) {
            console.error("날씨 연동 오류:", error);
            $('#temperature').text('-°C');
            $('#weatherMainText').text('날씨 정보를 가져올 수 없어요');
            $('#weatherSubText').text('잠시 후 다시 시도해 주세요');
        }
    });
}