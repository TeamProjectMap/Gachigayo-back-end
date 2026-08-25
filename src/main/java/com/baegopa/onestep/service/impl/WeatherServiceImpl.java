package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.WeatherDTO;
import com.baegopa.onestep.service.IWeatherService;
import com.baegopa.onestep.util.CmmUtil;
import com.baegopa.onestep.util.NetworkUtil;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URLEncoder;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

@Slf4j
@RequiredArgsConstructor
@Service
public class WeatherServiceImpl implements IWeatherService {

    // ⚠️ 공공데이터포털에서 발급받은 Decoding 인증키 입력
    @Value("${public-data.api-key:}")
    private String SERVICE_KEY;

    @Override
    public WeatherDTO getWeather(WeatherDTO pDTO) throws Exception {

        double lat = Double.parseDouble(pDTO.getLat());
        double lon = Double.parseDouble(pDTO.getLon());

        // 1. CmmUtil을 사용해 위경도를 기상청 격자(nx, ny)로 변환
        Map<String, Integer> grid = CmmUtil.convertToGrid(lat, lon);
        int nx = grid.get("nx");
        int ny = grid.get("ny");

        // 2. 현재 시간 기준 base_date, base_time 계산
        LocalDateTime now = LocalDateTime.now();
        if (now.getMinute() < 45) {
            now = now.minusHours(1);
        }
        String baseDate = now.format(DateTimeFormatter.ofPattern("yyyyMMdd"));
        String baseTime = now.format(DateTimeFormatter.ofPattern("HH00"));

        // 3. 기상청 초단기예보 API URL 생성
        StringBuilder urlBuilder = new StringBuilder("http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst");
        urlBuilder.append("?" + URLEncoder.encode("serviceKey", "UTF-8") + "=" + SERVICE_KEY);
        urlBuilder.append("&" + URLEncoder.encode("pageNo", "UTF-8") + "=1");
        urlBuilder.append("&" + URLEncoder.encode("numOfRows", "UTF-8") + "=60");
        urlBuilder.append("&" + URLEncoder.encode("dataType", "UTF-8") + "=JSON");
        urlBuilder.append("&" + URLEncoder.encode("base_date", "UTF-8") + "=" + URLEncoder.encode(baseDate, "UTF-8"));
        urlBuilder.append("&" + URLEncoder.encode("base_time", "UTF-8") + "=" + URLEncoder.encode(baseTime, "UTF-8"));
        urlBuilder.append("&" + URLEncoder.encode("nx", "UTF-8") + "=" + URLEncoder.encode(String.valueOf(nx), "UTF-8"));
        urlBuilder.append("&" + URLEncoder.encode("ny", "UTF-8") + "=" + URLEncoder.encode(String.valueOf(ny), "UTF-8"));

        // 4. NetworkUtil을 사용해 API 호출
        String jsonResponse = NetworkUtil.get(urlBuilder.toString());

        // 5. JSON 파싱
        ObjectMapper objectMapper = new ObjectMapper();
        JsonNode root = objectMapper.readTree(jsonResponse);
        JsonNode itemList = root.path("response").path("body").path("items").path("item");

        WeatherDTO rDTO = new WeatherDTO();
        rDTO.setLat(pDTO.getLat());
        rDTO.setLon(pDTO.getLon());

        if (itemList.isArray()) {
            for (JsonNode item : itemList) {
                String category = item.path("category").asText();

                // obsrValue와 fcstValue 모두 대응 가능하도록 추출
                String val = item.has("obsrValue") ? item.path("obsrValue").asText() : item.path("fcstValue").asText();

                // T1H: 기온 (소수점 반올림 처리 24.4 -> 24)
                if ("T1H".equals(category) && rDTO.getTemp() == null) {
                    try {
                        double tempVal = Double.parseDouble(val);
                        rDTO.setTemp(String.valueOf(Math.round(tempVal)));
                    } catch (Exception e) {
                        rDTO.setTemp(val);
                    }
                }
                // PTY: 강수형태 (0:없음, 1:비 등)
                else if ("PTY".equals(category) && rDTO.getPty() == null) {
                    rDTO.setPty(val);
                }
                // SKY: 하늘상태
                else if ("SKY".equals(category) && rDTO.getSky() == null) {
                    rDTO.setSky(val);
                }
            }

            // 초단기실황 호출 시 SKY 항목이 누락되므로 기본값 '1(맑음)' 세팅
            if (rDTO.getSky() == null) {
                rDTO.setSky("1");
            }
        }

        return rDTO;
    }
}
