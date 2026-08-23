package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.BusRealtimeDTO;
import com.baegopa.onestep.service.IBusRealtimeService;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
public class BusRealtimeService implements IBusRealtimeService {

    private static final String ARRIVAL_BASE_URL = "http://ws.bus.go.kr/api/rest/arrive/getArrInfoByRoute";
    private static final int STOP_SEARCH_START_INDEX = 1;
    private static final int STOP_SEARCH_END_INDEX = 20;
    private static final int ROUTE_SEARCH_START_INDEX = 1;
    private static final int ROUTE_SEARCH_PAGE_SIZE = 1000;
    private static final int ROUTE_SEARCH_MAX_INDEX = 50000;
    private static final int TIMEOUT_MILLIS = 5000;

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    @Value("${public-data.api-key:}")
    private String publicDataApiKey;

    @Value("${seoul.bus-stop-api-key:}")
    private String seoulBusStopApiKey;

    @Value("${seoul.bus-route-api-key:}")
    private String seoulBusRouteApiKey;

    public BusRealtimeService() {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofMillis(TIMEOUT_MILLIS));
        requestFactory.setReadTimeout(Duration.ofMillis(TIMEOUT_MILLIS));
        this.restClient = RestClient.builder()
                .requestFactory(requestFactory)
                .build();
        this.objectMapper = new ObjectMapper();
    }

    @Override
    public BusRealtimeDTO getRealtimeArrival(String stopName, String routeName) {
        if (isBlank(seoulBusStopApiKey)) {
            return BusRealtimeDTO.unavailable("CONFIG_ERROR", "서울시 버스정류소 API 설정이 필요합니다.", stopName, routeName);
        }

        if (isBlank(publicDataApiKey)) {
            return BusRealtimeDTO.unavailable("CONFIG_ERROR", "서울시 버스 API 설정이 필요합니다.", stopName, routeName);
        }

        if (isBlank(seoulBusRouteApiKey)) {
            return BusRealtimeDTO.unavailable("CONFIG_ERROR", "서울시 버스 노선 API 설정이 필요합니다.", stopName, routeName);
        }

        try {
            List<StopCandidate> stopCandidates = searchStopCandidates(stopName);
            if (stopCandidates.isEmpty()) {
                return BusRealtimeDTO.unavailable("STOP_NOT_FOUND", "정류소를 찾지 못했습니다.", stopName, routeName);
            }

            List<RouteStopMatch> matches = findRouteStopMatches(stopCandidates, routeName);

            if (matches.isEmpty()) {
                return BusRealtimeDTO.unavailable("ROUTE_NOT_FOUND", "해당 정류소에서 노선을 찾지 못했습니다.",
                        stopName, routeName);
            }

            if (matches.size() > 1) {
                return BusRealtimeDTO.unavailable("AMBIGUOUS_STOP", "같은 이름의 정류소가 여러 개라 방향을 확정할 수 없습니다.",
                        stopName, routeName);
            }

            RouteStopMatch match = matches.get(0);
            ArrivalItem arrival = getRouteArrival(match);
            BusRealtimeDTO result = toResult(stopName, routeName, match, arrival);
            if (isBlank(result.getFirstArrival().getMessage()) && isBlank(result.getSecondArrival().getMessage())) {
                return BusRealtimeDTO.unavailable("NO_ARRIVAL_INFO", "현재 도착 정보가 없습니다.", stopName, routeName);
            }

            return result;
        } catch (BusRealtimeKeyScopeException e) {
            log.warn("Seoul bus realtime API key scope check failed. status={}", e.getStatus());
            return BusRealtimeDTO.unavailable(e.getStatus(), "버스 실시간 도착정보 API 인증 범위를 확인해주세요.",
                    stopName, routeName);
        } catch (RestClientException e) {
            log.warn("Seoul bus realtime API request failed. status=EXTERNAL_API_ERROR", e);
            return BusRealtimeDTO.unavailable("EXTERNAL_API_ERROR", "버스 실시간 정보를 불러오지 못했습니다.",
                    stopName, routeName);
        } catch (Exception e) {
            log.warn("Seoul bus realtime processing failed. status=EXTERNAL_API_ERROR", e);
            return BusRealtimeDTO.unavailable("EXTERNAL_API_ERROR", "버스 실시간 정보를 처리하지 못했습니다.",
                    stopName, routeName);
        }
    }

    private List<StopCandidate> searchStopCandidates(String stopName) {
        JsonNode rootNode = restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .scheme("http")
                        .host("openapi.seoul.go.kr")
                        .port(8088)
                        .pathSegment(seoulBusStopApiKey, "json", "busStopLocationXyInfo",
                                String.valueOf(STOP_SEARCH_START_INDEX),
                                String.valueOf(STOP_SEARCH_END_INDEX),
                                stopName)
                        .build())
                .retrieve()
                .body(JsonNode.class);

        JsonNode responseNode = rootNode == null ? null : rootNode.get("busStopLocationXyInfo");
        if (responseNode == null || responseNode.isMissingNode()) {
            return List.of();
        }

        String resultCode = text(responseNode.path("RESULT"), "CODE");
        if (!isBlank(resultCode) && !"INFO-000".equals(resultCode)) {
            log.warn("Seoul stop search returned non-ok result. status={}", resultCode);
            return List.of();
        }

        JsonNode rowsNode = responseNode.get("row");
        if (rowsNode == null || !rowsNode.isArray()) {
            return List.of();
        }

        String normalizedRequestedStop = normalizeStopName(stopName);
        List<StopCandidate> candidates = new ArrayList<>();

        for (JsonNode rowNode : rowsNode) {
            String stationId = text(rowNode, "STOPS_NO");
            String arsId = normalizeArsId(text(rowNode, "NODE_ID"));
            String stopsName = text(rowNode, "STOPS_NM");

            if (isBlank(stationId) || isBlank(stopsName)) {
                continue;
            }

            String normalizedStopsName = normalizeStopName(stopsName);
            if (!normalizedStopsName.equals(normalizedRequestedStop)
                    && !normalizedStopsName.contains(normalizedRequestedStop)) {
                continue;
            }

            candidates.add(new StopCandidate(
                    stationId,
                    arsId,
                    stopsName,
                    text(rowNode, "XCRD"),
                    text(rowNode, "YCRD")
            ));
        }

        return candidates;
    }

    private List<RouteStopMatch> findRouteStopMatches(List<StopCandidate> stopCandidates, String routeName) {
        String normalizedRequestedRoute = normalizeRouteName(routeName);
        List<RouteStopMatch> matches = new ArrayList<>();
        Integer totalCount = null;

        for (int startIndex = ROUTE_SEARCH_START_INDEX;
             startIndex <= ROUTE_SEARCH_MAX_INDEX && (totalCount == null || startIndex <= totalCount);
             startIndex += ROUTE_SEARCH_PAGE_SIZE) {
            int endIndex = startIndex + ROUTE_SEARCH_PAGE_SIZE - 1;
            int currentStartIndex = startIndex;
            int currentEndIndex = endIndex;
            JsonNode rootNode = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .scheme("http")
                            .host("openapi.seoul.go.kr")
                            .port(8088)
                            .pathSegment(seoulBusRouteApiKey, "json", "busRteInfo",
                                    String.valueOf(currentStartIndex),
                                    String.valueOf(currentEndIndex))
                            .build())
                    .retrieve()
                    .body(JsonNode.class);

            JsonNode responseNode = rootNode == null ? null : rootNode.get("busRteInfo");
            if (responseNode == null || responseNode.isMissingNode()) {
                return matches;
            }

            String resultCode = text(responseNode.path("RESULT"), "CODE");
            if (!isBlank(resultCode) && !"INFO-000".equals(resultCode)) {
                log.warn("Seoul bus route search returned non-ok result. status={}", resultCode);
                return matches;
            }

            if (totalCount == null) {
                totalCount = integer(text(responseNode, "list_total_count"));
            }

            JsonNode rowsNode = responseNode.get("row");
            if (rowsNode == null || !rowsNode.isArray()) {
                return matches;
            }

            for (JsonNode rowNode : rowsNode) {
                String routeId = text(rowNode, "ROUTE_ID");
                String routeNameValue = text(rowNode, "RTE_NM");
                String stationOrder = text(rowNode, "SN");
                Integer parsedStationOrder = integer(stationOrder);
                String routeStopNodeId = text(rowNode, "NODE_ID");
                String routeStopArsId = normalizeArsId(text(rowNode, "ARS_ID"));

                if (isBlank(routeId) || isBlank(routeNameValue) || parsedStationOrder == null) {
                    continue;
                }

                if (!normalizedRequestedRoute.equals(normalizeRouteName(routeNameValue))) {
                    continue;
                }

                for (StopCandidate stopCandidate : stopCandidates) {
                    boolean arsMatches = !isBlank(stopCandidate.arsId()) && stopCandidate.arsId().equals(routeStopArsId);
                    boolean nodeMatches = !isBlank(stopCandidate.stationId()) && stopCandidate.stationId().equals(routeStopNodeId);
                    if (!arsMatches && !nodeMatches) {
                        continue;
                    }

                    matches.add(new RouteStopMatch(
                            stopCandidate,
                            routeId,
                            routeNameValue,
                            parsedStationOrder,
                            routeStopNodeId,
                            routeStopArsId,
                            text(rowNode, "STATION_NM"),
                            text(rowNode, "XCRD"),
                            text(rowNode, "YCRD")
                    ));
                }
            }
        }

        return matches;
    }

    private ArrivalItem getRouteArrival(RouteStopMatch match) throws Exception {
        String body = restClient.get()
                .uri(uriBuilder -> uriBuilder
                        .scheme("http")
                        .host("ws.bus.go.kr")
                        .path("/api/rest/arrive/getArrInfoByRoute")
                        .queryParam("serviceKey", publicDataApiKey.trim())
                        .queryParam("stId", match.nodeId())
                        .queryParam("busRouteId", match.routeId())
                        .queryParam("ord", match.stationOrder())
                        .queryParam("resultType", "json")
                        .build())
                .retrieve()
                .body(String.class);

        if (isBlank(body)) {
            return ArrivalItem.empty(match);
        }

        String trimmedBody = body.trim();
        if (trimmedBody.startsWith("{")) {
            return parseJsonRouteArrival(trimmedBody, match);
        }

        return parseXmlRouteArrival(trimmedBody, match);
    }

    private ArrivalItem parseXmlRouteArrival(String xml, RouteStopMatch match) throws Exception {
        org.w3c.dom.Document document = createSecureDocumentBuilder().parse(
                new ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));
        org.w3c.dom.Element root = document.getDocumentElement();

        String headerCode = firstText(root, "headerCd");
        if (!isBlank(headerCode) && !"0".equals(headerCode)) {
            String headerMessage = firstNotBlank(firstText(root, "headerMsg"), firstText(root, "returnAuthMsg"));
            log.warn("Seoul bus arrival returned non-ok header. status={}", headerCode);
            if (isRealtimeKeyScopeError(headerCode, headerMessage)) {
                throw new BusRealtimeKeyScopeException("BUS_REALTIME_KEY_SCOPE_ERROR");
            }
            return ArrivalItem.empty(match);
        }

        org.w3c.dom.NodeList itemNodes = root.getElementsByTagName("itemList");
        if (itemNodes.getLength() == 0 || !(itemNodes.item(0) instanceof org.w3c.dom.Element itemElement)) {
            return ArrivalItem.empty(match);
        }

        return new ArrivalItem(
                firstNotBlank(firstText(itemElement, "stId"), match.nodeId()),
                firstNotBlank(firstText(itemElement, "stNm"), match.stationName()),
                firstNotBlank(normalizeArsId(firstText(itemElement, "arsId")), match.arsId()),
                firstText(itemElement, "busRouteAbrv"),
                firstNotBlank(firstText(itemElement, "busRouteId"), match.routeId()),
                firstNotBlank(firstText(itemElement, "rtNm"), match.routeName()),
                firstNotBlank(integer(firstText(itemElement, "staOrd")), match.stationOrder()),
                firstText(itemElement, "adirection"),
                firstText(itemElement, "term"),
                firstText(itemElement, "arrmsg1"),
                firstText(itemElement, "arrmsg2"),
                integer(firstText(itemElement, "traTime1")),
                integer(firstText(itemElement, "traTime2")),
                firstText(itemElement, "busType1"),
                firstText(itemElement, "busType2"),
                fullFlag(firstText(itemElement, "isFullFlag1")),
                fullFlag(firstText(itemElement, "isFullFlag2"))
        );
    }

    private ArrivalItem parseJsonRouteArrival(String json, RouteStopMatch match) throws Exception {
        JsonNode rootNode = objectMapper.readTree(json);
        JsonNode headerNode = firstExisting(rootNode, "msgHeader", "comMsgHeader");
        String headerCode = text(headerNode, "headerCd");
        if (!isBlank(headerCode) && !"0".equals(headerCode)) {
            String headerMessage = firstNotBlank(text(headerNode, "headerMsg"), text(headerNode, "returnAuthMsg"));
            log.warn("Seoul bus arrival returned non-ok header. status={}", headerCode);
            if (isRealtimeKeyScopeError(headerCode, headerMessage)) {
                throw new BusRealtimeKeyScopeException("BUS_REALTIME_KEY_SCOPE_ERROR");
            }
            return ArrivalItem.empty(match);
        }

        JsonNode itemNode = firstItemList(rootNode);
        if (itemNode == null || itemNode.isMissingNode() || itemNode.isNull()) {
            return ArrivalItem.empty(match);
        }

        return new ArrivalItem(
                firstNotBlank(text(itemNode, "stId"), match.nodeId()),
                firstNotBlank(text(itemNode, "stNm"), match.stationName()),
                firstNotBlank(normalizeArsId(text(itemNode, "arsId")), match.arsId()),
                text(itemNode, "busRouteAbrv"),
                firstNotBlank(text(itemNode, "busRouteId"), match.routeId()),
                firstNotBlank(text(itemNode, "rtNm"), match.routeName()),
                firstNotBlank(integer(text(itemNode, "staOrd")), match.stationOrder()),
                text(itemNode, "adirection"),
                text(itemNode, "term"),
                text(itemNode, "arrmsg1"),
                text(itemNode, "arrmsg2"),
                integer(text(itemNode, "traTime1")),
                integer(text(itemNode, "traTime2")),
                text(itemNode, "busType1"),
                text(itemNode, "busType2"),
                fullFlag(text(itemNode, "isFullFlag1")),
                fullFlag(text(itemNode, "isFullFlag2"))
        );
    }

    private BusRealtimeDTO toResult(String requestedStopName, String requestedRouteName, RouteStopMatch match, ArrivalItem item) {
        StopCandidate stop = match.stop();

        BusRealtimeDTO result = new BusRealtimeDTO();
        result.setSuccess(true);
        result.setAvailable(true);
        result.setStatus("OK");
        result.setMessage("버스 실시간 도착정보를 조회했습니다.");
        result.setRequestedStopName(requestedStopName);
        result.setRequestedRouteName(requestedRouteName);
        result.setStationName(firstNotBlank(item.getStationName(), stop.name()));
        result.setArsId(firstNotBlank(item.getArsId(), stop.arsId()));
        result.setStId(item.getStationId());
        result.setRouteName(firstNotBlank(item.getRouteName(), item.getRouteAbbr()));
        result.setBusRouteId(item.getRouteId());
        result.setStationOrder(item.getStationOrder());
        result.setDirection(item.getDirection());
        result.setTerm(item.getTerm());
        result.setFirstArrival(toArrival(item.getFirstMessage(), item.getFirstSeconds(), item.getFirstBusType(), item.getFirstFull()));
        result.setSecondArrival(toArrival(item.getSecondMessage(), item.getSecondSeconds(), item.getSecondBusType(), item.getSecondFull()));
        return result;
    }

    private BusRealtimeDTO.Arrival toArrival(String message, Integer seconds, String busType, Boolean full) {
        BusRealtimeDTO.Arrival arrival = new BusRealtimeDTO.Arrival();
        arrival.setMessage(message);
        arrival.setSeconds(seconds);
        arrival.setBusType(busType);
        arrival.setLowFloor("1".equals(busType));
        arrival.setFull(full);
        return arrival;
    }

    private DocumentBuilder createSecureDocumentBuilder() throws ParserConfigurationException {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_DTD, "");
        factory.setAttribute(XMLConstants.ACCESS_EXTERNAL_SCHEMA, "");
        return factory.newDocumentBuilder();
    }

    private String normalizeStopName(String value) {
        if (value == null) {
            return "";
        }

        return value.trim()
                .replaceAll("\\s+", " ")
                .replace(".", "")
                .replace("ㆍ", "")
                .replace("·", "");
    }

    private String normalizeRouteName(String value) {
        if (value == null) {
            return "";
        }

        String normalized = value.trim().replaceAll("\\s+", "");
        if (normalized.endsWith("번")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        return normalized;
    }

    private String normalizeArsId(String arsId) {
        if (isBlank(arsId)) {
            return null;
        }

        String trimmed = arsId.trim();
        if (trimmed.matches("\\d{4}")) {
            return "0" + trimmed;
        }

        return trimmed;
    }

    private boolean isRealtimeKeyScopeError(String headerCode, String headerMessage) {
        String normalizedMessage = headerMessage == null ? "" : headerMessage.toUpperCase();
        return !"0".equals(headerCode)
                && ("7".equals(headerCode)
                || normalizedMessage.contains("KEY")
                || normalizedMessage.contains("SERVICE")
                || normalizedMessage.contains("AUTH")
                || normalizedMessage.contains("인증")
                || normalizedMessage.contains("권한")
                || normalizedMessage.contains("등록"));
    }

    private String firstText(org.w3c.dom.Element element, String tagName) {
        org.w3c.dom.NodeList nodes = element.getElementsByTagName(tagName);
        if (nodes.getLength() == 0 || nodes.item(0) == null) {
            return null;
        }

        String value = nodes.item(0).getTextContent();
        return isBlank(value) ? null : value.trim();
    }

    private String text(JsonNode node, String fieldName) {
        JsonNode valueNode = node == null ? null : node.get(fieldName);
        return valueNode == null || valueNode.isNull() ? null : valueNode.asText();
    }

    private JsonNode firstExisting(JsonNode rootNode, String... fieldNames) {
        if (rootNode == null || rootNode.isNull()) {
            return null;
        }

        for (String fieldName : fieldNames) {
            JsonNode valueNode = rootNode.get(fieldName);
            if (valueNode != null && !valueNode.isNull() && !valueNode.isMissingNode()) {
                return valueNode;
            }
        }

        JsonNode serviceResultNode = rootNode.get("ServiceResult");
        if (serviceResultNode != null && !serviceResultNode.isNull() && !serviceResultNode.isMissingNode()) {
            return firstExisting(serviceResultNode, fieldNames);
        }

        return null;
    }

    private JsonNode firstItemList(JsonNode rootNode) {
        JsonNode itemListNode = firstExisting(rootNode, "itemList");
        if (itemListNode == null || itemListNode.isNull() || itemListNode.isMissingNode()) {
            JsonNode bodyNode = firstExisting(rootNode, "msgBody");
            itemListNode = bodyNode == null ? null : bodyNode.get("itemList");
        }

        if (itemListNode == null || itemListNode.isNull() || itemListNode.isMissingNode()) {
            return null;
        }

        if (itemListNode.isArray()) {
            return itemListNode.size() == 0 ? null : itemListNode.get(0);
        }

        return itemListNode;
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

    private Boolean fullFlag(String value) {
        if (isBlank(value)) {
            return null;
        }

        if ("0".equals(value.trim())) {
            return false;
        }

        if ("1".equals(value.trim())) {
            return true;
        }

        return null;
    }

    private String firstNotBlank(String first, String second) {
        return isBlank(first) ? second : first;
    }

    private Integer firstNotBlank(Integer first, Integer second) {
        return first == null ? second : first;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    private record StopCandidate(String stationId, String arsId, String name, String x, String y) {
    }

    private record RouteStopMatch(
            StopCandidate stop,
            String routeId,
            String routeName,
            Integer stationOrder,
            String nodeId,
            String arsId,
            String stationName,
            String x,
            String y
    ) {
    }

    @Getter
    @RequiredArgsConstructor
    private static class BusRealtimeKeyScopeException extends RuntimeException {
        private final String status;
    }

    @Getter
    @RequiredArgsConstructor
    private static class ArrivalItem {
        private final String stationId;
        private final String stationName;
        private final String arsId;
        private final String routeAbbr;
        private final String routeId;
        private final String routeName;
        private final Integer stationOrder;
        private final String direction;
        private final String term;
        private final String firstMessage;
        private final String secondMessage;
        private final Integer firstSeconds;
        private final Integer secondSeconds;
        private final String firstBusType;
        private final String secondBusType;
        private final Boolean firstFull;
        private final Boolean secondFull;

        private static ArrivalItem empty(RouteStopMatch match) {
            return new ArrivalItem(
                    match.nodeId(),
                    match.stationName(),
                    match.arsId(),
                    null,
                    match.routeId(),
                    match.routeName(),
                    match.stationOrder(),
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null
            );
        }
    }
}
