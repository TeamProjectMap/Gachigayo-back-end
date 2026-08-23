package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.SubwayRealtimeDTO;
import com.baegopa.onestep.service.ISubwayRealtimeService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class SubwayRealtimeService implements ISubwayRealtimeService {

    private static final String API_HOST = "swopenAPI.seoul.go.kr";
    private static final String SERVICE_NAME = "realtimeStationArrival";
    private static final int STATION_START_INDEX = 0;
    private static final int STATION_END_INDEX = 20;
    private static final int TIMEOUT_MILLIS = 5000;
    private static final Duration ALL_CACHE_TTL = Duration.ofSeconds(25);
    private static final Map<String, String> SUBWAY_ID_BY_LINE_NUMBER = Map.of(
            "5", "1005"
    );

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    private volatile CachedApiResponse allCache;

    @Value("${seoul.subway.realtime-api-key:}")
    private String realtimeApiKey;

    public SubwayRealtimeService() {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(TIMEOUT_MILLIS));
        requestFactory.setReadTimeout(Duration.ofMillis(TIMEOUT_MILLIS));
        this.restClient = RestClient.builder()
                .requestFactory(requestFactory)
                .build();
        this.objectMapper = new ObjectMapper();
    }

    @Override
    public SubwayRealtimeDTO getRealtimeArrivals(String stationName, String lineName) {
        if (isBlank(realtimeApiKey)) {
            return SubwayRealtimeDTO.unavailable("API_KEY_MISSING", "Seoul subway realtime API key is not configured.",
                    stationName, lineName);
        }

        String normalizedStationName = normalizeStationName(stationName);
        String normalizedLineName = normalizeLineName(lineName);

        try {
            log.debug("Subway realtime API request started: station={}", stationName);

            ApiResponse stationResponse = requestStationApiVariants(stationName, normalizedStationName);
            if (stationResponse.isOk() && !stationResponse.rows().isEmpty()) {
                return toDto(stationResponse, stationName, lineName, normalizedStationName, normalizedLineName);
            }

            if (stationResponse.isAuthError()) {
                return SubwayRealtimeDTO.unavailable("API_AUTH_ERROR", stationResponse.message(), stationName, lineName);
            }

            ApiResponse allResponse = requestAllApi();
            if (allResponse.isOk()) {
                return toDto(allResponse, stationName, lineName, normalizedStationName, normalizedLineName);
            }

            if (allResponse.isAuthError()) {
                return SubwayRealtimeDTO.unavailable("API_AUTH_ERROR", allResponse.message(), stationName, lineName);
            }

            log.warn("Seoul subway realtime API returned non-ok result. stationStatus={}, allStatus={}",
                    stationResponse.resultCode(), allResponse.resultCode());
            return SubwayRealtimeDTO.unavailable("API_ERROR", firstNotBlank(allResponse.message(), stationResponse.message()),
                    stationName, lineName);
        } catch (RestClientResponseException e) {
            log.warn("Seoul subway realtime API HTTP error. status={}", e.getStatusCode());
            return SubwayRealtimeDTO.unavailable("API_ERROR", "Seoul subway realtime API HTTP error.",
                    stationName, lineName);
        } catch (RestClientException e) {
            log.warn("Seoul subway realtime API request failed.", e);
            return SubwayRealtimeDTO.unavailable("API_ERROR", "Seoul subway realtime API request failed.",
                    stationName, lineName);
        } catch (Exception e) {
            log.warn("Seoul subway realtime API processing failed.", e);
            return SubwayRealtimeDTO.unavailable("API_ERROR", "Seoul subway realtime API processing failed.",
                    stationName, lineName);
        }
    }

    private ApiResponse requestStationApiVariants(String stationName, String normalizedStationName) throws Exception {
        ApiResponse firstResponse = null;

        for (String candidate : stationNameCandidates(stationName, normalizedStationName)) {
            ApiResponse response = requestStationApi(candidate);
            if (firstResponse == null) {
                firstResponse = response;
            }

            if (response.isOk() && !response.rows().isEmpty()) {
                return response;
            }
        }

        return firstResponse == null ? ApiResponse.error(EndpointType.STATION, "API_ERROR", "No station query candidate.")
                : firstResponse;
    }

    private ApiResponse requestStationApi(String stationName) throws Exception {
        String body = restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .scheme("http")
                        .host(API_HOST)
                        .pathSegment("api", "subway", realtimeApiKey.trim(), "json", SERVICE_NAME,
                                String.valueOf(STATION_START_INDEX), String.valueOf(STATION_END_INDEX),
                                stationName)
                        .build())
                .retrieve()
                .body(String.class);

        return parseApiResponse(body, EndpointType.STATION);
    }

    private ApiResponse requestAllApi() throws Exception {
        CachedApiResponse cached = allCache;
        Instant now = Instant.now();
        if (cached != null && cached.expiresAt().isAfter(now)) {
            return cached.response();
        }

        String body = restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .scheme("http")
                        .host(API_HOST)
                        .pathSegment("api", "subway", realtimeApiKey.trim(), "json", SERVICE_NAME, "ALL")
                        .build())
                .retrieve()
                .body(String.class);

        ApiResponse response = parseApiResponse(body, EndpointType.ALL);
        if (response.isOk()) {
            allCache = new CachedApiResponse(response, now.plus(ALL_CACHE_TTL));
        }
        return response;
    }

    private ApiResponse parseApiResponse(String body, EndpointType endpointType) throws Exception {
        if (isBlank(body)) {
            return ApiResponse.error(endpointType, "API_ERROR", "Empty Seoul API response.");
        }

        JsonNode rootNode = objectMapper.readTree(body);
        JsonNode serviceNode = rootNode.path(SERVICE_NAME);
        JsonNode resultNode = serviceNode.isMissingNode() ? rootNode.path("RESULT") : serviceNode.path("RESULT");

        String resultCode = text(resultNode, "CODE");
        String resultMessage = text(resultNode, "MESSAGE");
        if (isBlank(resultCode) && !serviceNode.isMissingNode()) {
            resultCode = "INFO-000";
        }

        if (!"INFO-000".equals(resultCode)) {
            return ApiResponse.error(endpointType, resultCode, resultMessage);
        }

        JsonNode rowsNode = serviceNode.path("row");
        if (!rowsNode.isArray()) {
            return new ApiResponse(endpointType, true, resultCode, resultMessage, List.of());
        }

        List<JsonNode> rows = new ArrayList<>();
        rowsNode.forEach(rows::add);
        return new ApiResponse(endpointType, true, resultCode, resultMessage, rows);
    }

    private SubwayRealtimeDTO toDto(ApiResponse response,
                                    String requestedStationName,
                                    String requestedLineName,
                                    String normalizedStationName,
                                    String normalizedLineName) {
        List<JsonNode> stationRows = response.rows().stream()
                .filter(row -> normalizeStationName(text(row, "statnNm")).equals(normalizedStationName))
                .toList();

        if (stationRows.isEmpty()) {
            return SubwayRealtimeDTO.unavailable("STATION_NOT_FOUND", "Station was not found in Seoul API response.",
                    requestedStationName, requestedLineName);
        }

        List<JsonNode> lineRows = stationRows.stream()
                .filter(row -> matchesLine(row, normalizedLineName))
                .toList();

        if (lineRows.isEmpty()) {
            return SubwayRealtimeDTO.unavailable("LINE_NOT_FOUND", "Line was not found for the requested station.",
                    requestedStationName, requestedLineName);
        }

        List<SubwayRealtimeDTO.Arrival> arrivals = lineRows.stream()
                .map(this::toArrival)
                .sorted(Comparator.comparing(SubwayRealtimeDTO.Arrival::getArrivalSeconds,
                        Comparator.nullsLast(Integer::compareTo)))
                .toList();

        if (arrivals.isEmpty()) {
            return SubwayRealtimeDTO.unavailable("NO_ARRIVAL_DATA", "Realtime arrival data is not available.",
                    requestedStationName, requestedLineName);
        }

        JsonNode firstRow = lineRows.get(0);
        SubwayRealtimeDTO dto = new SubwayRealtimeDTO();
        dto.setSuccess(true);
        dto.setAvailable(true);
        dto.setStatus("OK");
        dto.setMessage("Seoul subway realtime arrival data is available.");
        dto.setRequestedStationName(requestedStationName);
        dto.setRequestedLineName(requestedLineName);
        dto.setStationName(text(firstRow, "statnNm"));
        dto.setLineName(firstNotBlank(text(firstRow, "subwayNm"), requestedLineName));
        dto.setSubwayId(text(firstRow, "subwayId"));
        dto.setArrivals(arrivals);
        return dto;
    }

    private SubwayRealtimeDTO.Arrival toArrival(JsonNode row) {
        SubwayRealtimeDTO.Arrival arrival = new SubwayRealtimeDTO.Arrival();
        arrival.setDirection(text(row, "updnLine"));
        arrival.setTrainLineName(text(row, "trainLineNm"));
        arrival.setArrivalSeconds(integer(text(row, "barvlDt")));
        arrival.setArrivalMessage(text(row, "arvlMsg2"));
        arrival.setArrivalDetailMessage(text(row, "arvlMsg3"));
        arrival.setDestinationStationName(text(row, "bstatnNm"));
        arrival.setTrainStatus(text(row, "btrainSttus"));
        arrival.setReceivedAt(text(row, "recptnDt"));
        arrival.setArrivalCode(text(row, "arvlCd"));
        return arrival;
    }

    private boolean matchesLine(JsonNode row, String normalizedLineName) {
        String subwayName = normalizeLineName(text(row, "subwayNm"));
        if (!isBlank(subwayName) && subwayName.equals(normalizedLineName)) {
            return true;
        }

        String requestedLineNumber = extractLineNumber(normalizedLineName);
        String requestedSubwayId = SUBWAY_ID_BY_LINE_NUMBER.get(requestedLineNumber);
        return !isBlank(requestedSubwayId) && requestedSubwayId.equals(text(row, "subwayId"));
    }

    private String normalizeStationName(String value) {
        if (value == null) {
            return "";
        }

        String normalized = value.trim().replaceAll("\\s+", "");
        if (normalized.length() > 1 && normalized.endsWith("역")) {
            return normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private List<String> stationNameCandidates(String stationName, String normalizedStationName) {
        List<String> candidates = new ArrayList<>();
        addIfNotBlank(candidates, normalizedStationName);
        addIfNotBlank(candidates, stationName);
        if (!isBlank(normalizedStationName)) {
            addIfNotBlank(candidates, normalizedStationName + "역");
        }
        return candidates;
    }

    private String normalizeLineName(String value) {
        if (value == null) {
            return "";
        }

        String normalized = value.trim().replaceAll("\\s+", "");
        if (normalized.endsWith("호선")) {
            normalized = normalized.substring(0, normalized.length() - 2);
        }
        if (normalized.endsWith("선")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private String extractLineNumber(String normalizedLineName) {
        if (isBlank(normalizedLineName)) {
            return "";
        }

        String digits = normalizedLineName.replaceAll("[^0-9]", "");
        return isBlank(digits) ? normalizedLineName : digits;
    }

    private String text(JsonNode node, String fieldName) {
        JsonNode valueNode = node == null ? null : node.get(fieldName);
        return valueNode == null || valueNode.isNull() ? null : valueNode.asText();
    }

    private Integer integer(String value) {
        if (isBlank(value)) {
            return null;
        }

        try {
            return Integer.parseInt(value.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String firstNotBlank(String first, String second) {
        return isBlank(first) ? second : first;
    }

    private void addIfNotBlank(List<String> values, String value) {
        if (isBlank(value)) {
            return;
        }

        String trimmed = value.trim();
        if (!values.contains(trimmed)) {
            values.add(trimmed);
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private enum EndpointType {
        STATION,
        ALL
    }

    private record CachedApiResponse(ApiResponse response, Instant expiresAt) {
    }

    private record ApiResponse(EndpointType endpointType,
                               boolean ok,
                               String resultCode,
                               String message,
                               List<JsonNode> rows) {

        private static ApiResponse error(EndpointType endpointType, String resultCode, String message) {
            return new ApiResponse(endpointType, false, resultCode, message, List.of());
        }

        private boolean isOk() {
            return ok;
        }

        private boolean isAuthError() {
            String normalizedCode = resultCode == null ? "" : resultCode.toUpperCase();
            String normalizedMessage = message == null ? "" : message.toUpperCase();
            return normalizedCode.contains("ERROR-300")
                    || normalizedCode.contains("ERROR-330")
                    || normalizedCode.contains("ERROR-331")
                    || normalizedCode.contains("ERROR-332")
                    || normalizedCode.contains("ERROR-333")
                    || normalizedCode.contains("ERROR-334")
                    || normalizedCode.contains("ERROR-335")
                    || normalizedCode.contains("ERROR-336")
                    || normalizedMessage.contains("KEY")
                    || normalizedMessage.contains("AUTH");
        }
    }
}
