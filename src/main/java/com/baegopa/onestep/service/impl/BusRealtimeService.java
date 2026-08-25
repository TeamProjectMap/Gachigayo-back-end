package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.BusRealtimeDTO;
import com.baegopa.onestep.service.IBusRealtimeService;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriBuilder;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import java.io.StringReader;
import java.net.URI;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CharsetDecoder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;
import org.xml.sax.InputSource;

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
    private static final Charset LEGACY_BUS_CHARSET = Charset.forName("MS949");
    private static final Duration ROUTE_CACHE_TTL = Duration.ofMinutes(10);
    private static final Duration STOP_CACHE_TTL = Duration.ofMinutes(2);

    private final RestClient restClient;
    private final ObjectMapper objectMapper;
    private final Object routeCacheLock = new Object();
    private final Object stopCacheLock = new Object();
    private final Map<String, StopCacheEntry> stopCandidateCache = new ConcurrentHashMap<>();
    private volatile RouteCacheEntry routeCacheEntry = RouteCacheEntry.empty();

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
    public BusRealtimeDTO getRealtimeArrival(String stopName, String routeName, String nextStopName, String directionHint) {
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
            log.debug("Bus realtime pipeline started. requestedStopName={}, requestedRouteName={}, nextStopName={}, directionHint={}",
                    stopName, routeName, nextStopName, directionHint);
            List<StopCandidate> stopCandidates = searchStopCandidates(stopName);
            log.debug("Bus realtime stop candidates found. requestedStopName={}, requestedRouteName={}, candidateCount={}",
                    stopName, routeName, stopCandidates.size());
            if (stopCandidates.isEmpty()) {
                return BusRealtimeDTO.unavailable("STOP_NOT_FOUND", "정류소를 찾지 못했습니다.", stopName, routeName);
            }

            List<RouteStopMatch> matches = findRouteStopMatches(stopCandidates, routeName, nextStopName, directionHint);
            log.debug("Bus realtime route-stop matches found. requestedStopName={}, requestedRouteName={}, matchCount={}",
                    stopName, routeName, matches.size());

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
            log.debug("Bus realtime result built. requestedStopName={}, requestedRouteName={}, availableCandidate={}, status={}, firstMessage={}, secondMessage={}",
                    stopName,
                    routeName,
                    !isBlank(result.getFirstArrival().getMessage()) || !isBlank(result.getSecondArrival().getMessage()),
                    result.getStatus(),
                    result.getFirstArrival().getMessage(),
                    result.getSecondArrival().getMessage());
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

    private List<StopCandidate> searchStopCandidates(String stopName) throws Exception {
        String cacheKey = normalizeStopName(stopName);
        long now = System.currentTimeMillis();
        StopCacheEntry cached = stopCandidateCache.get(cacheKey);
        if (cached != null && cached.isFresh(now)) {
            return cached.candidates();
        }

        synchronized (stopCacheLock) {
            now = System.currentTimeMillis();
            cached = stopCandidateCache.get(cacheKey);
            if (cached != null && cached.isFresh(now)) {
                return cached.candidates();
            }

            List<StopCandidate> candidates = List.copyOf(loadStopCandidates(stopName));
            stopCandidateCache.put(cacheKey, new StopCacheEntry(candidates, now + STOP_CACHE_TTL.toMillis()));
            return candidates;
        }
    }

    private List<StopCandidate> loadStopCandidates(String stopName) throws Exception {
        JsonNode rootNode = requestLegacyBusJson("stopSearch", uriBuilder -> uriBuilder
                        .scheme("http")
                        .host("openapi.seoul.go.kr")
                        .port(8088)
                        .pathSegment(seoulBusStopApiKey, "json", "busStopLocationXyInfo",
                                String.valueOf(STOP_SEARCH_START_INDEX),
                                String.valueOf(STOP_SEARCH_END_INDEX),
                                stopName)
                        .build());

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

    private List<RouteStopMatch> findRouteStopMatches(List<StopCandidate> stopCandidates,
                                                      String routeName,
                                                      String nextStopName,
                                                      String directionHint) throws Exception {
        String normalizedRequestedRoute = normalizeRouteName(routeName);
        List<RouteStopMatch> matches = new ArrayList<>();

        for (RouteInfo routeInfo : getCachedRouteInfos()) {
            if (!normalizedRequestedRoute.equals(normalizeRouteName(routeInfo.routeName()))) {
                continue;
            }

            for (StopCandidate stopCandidate : stopCandidates) {
                boolean arsMatches = !isBlank(stopCandidate.arsId()) && stopCandidate.arsId().equals(routeInfo.arsId());
                boolean nodeMatches = !isBlank(stopCandidate.stationId()) && stopCandidate.stationId().equals(routeInfo.nodeId());
                if (!arsMatches && !nodeMatches) {
                    continue;
                }

                matches.add(new RouteStopMatch(
                        stopCandidate,
                        routeInfo.routeId(),
                        routeInfo.routeName(),
                        routeInfo.stationOrder(),
                        routeInfo.nodeId(),
                        routeInfo.arsId(),
                        routeInfo.stationName(),
                        routeInfo.x(),
                        routeInfo.y()
                ));
            }
        }

        return selectDirectionMatchedRouteStopMatches(matches, nextStopName, directionHint);
    }

    private List<RouteStopMatch> selectDirectionMatchedRouteStopMatches(List<RouteStopMatch> matches,
                                                                        String nextStopName,
                                                                        String directionHint) throws Exception {
        if (matches.size() <= 1) {
            return matches;
        }

        List<RouteStopMatch> nextStopMatches = filterByNextStop(matches, nextStopName);
        if (!nextStopMatches.isEmpty()) {
            log.debug("Bus realtime route-stop matches filtered by next stop. nextStopName={}, beforeCount={}, afterCount={}",
                    nextStopName, matches.size(), nextStopMatches.size());
            return nextStopMatches;
        }

        List<RouteStopMatch> directionHintMatches = filterByDirectionHint(matches, directionHint);
        if (!directionHintMatches.isEmpty()) {
            log.debug("Bus realtime route-stop matches filtered by direction hint. directionHint={}, beforeCount={}, afterCount={}",
                    directionHint, matches.size(), directionHintMatches.size());
            return directionHintMatches;
        }

        log.debug("Bus realtime route-stop match remains ambiguous. nextStopName={}, directionHint={}, matchCount={}",
                nextStopName, directionHint, matches.size());
        return matches;
    }

    private List<RouteStopMatch> filterByNextStop(List<RouteStopMatch> matches, String nextStopName) throws Exception {
        if (isBlank(nextStopName)) {
            return List.of();
        }

        String normalizedNextStopName = normalizeStopName(nextStopName);
        List<RouteInfo> routeInfos = getCachedRouteInfos();
        List<RouteStopMatch> filtered = new ArrayList<>();

        for (RouteStopMatch match : matches) {
            RouteInfo nextRouteInfo = findRouteInfoByOrder(routeInfos, match.routeId(), match.stationOrder() + 1);
            if (nextRouteInfo == null) {
                continue;
            }

            String normalizedRouteNextStop = normalizeStopName(nextRouteInfo.stationName());
            if (!isBlank(normalizedRouteNextStop)
                    && (normalizedRouteNextStop.equals(normalizedNextStopName)
                    || normalizedRouteNextStop.contains(normalizedNextStopName)
                    || normalizedNextStopName.contains(normalizedRouteNextStop))) {
                filtered.add(match);
            }
        }

        return filtered;
    }

    private List<RouteStopMatch> filterByDirectionHint(List<RouteStopMatch> matches, String directionHint) {
        if (isBlank(directionHint)) {
            return List.of();
        }

        String normalizedDirectionHint = normalizeStopName(directionHint);
        List<RouteStopMatch> filtered = new ArrayList<>();

        for (RouteStopMatch match : matches) {
            String normalizedDirection = normalizeStopName(match.stationName());
            if (!isBlank(normalizedDirection) && normalizedDirectionHint.contains(normalizedDirection)) {
                filtered.add(match);
            }
        }

        return filtered;
    }

    private RouteInfo findRouteInfoByOrder(List<RouteInfo> routeInfos, String routeId, int stationOrder) {
        for (RouteInfo routeInfo : routeInfos) {
            if (routeId.equals(routeInfo.routeId()) && routeInfo.stationOrder() == stationOrder) {
                return routeInfo;
            }
        }

        return null;
    }

    private List<RouteInfo> getCachedRouteInfos() throws Exception {
        long now = System.currentTimeMillis();
        RouteCacheEntry cached = routeCacheEntry;
        if (cached.isFresh(now)) {
            return cached.routes();
        }

        synchronized (routeCacheLock) {
            now = System.currentTimeMillis();
            cached = routeCacheEntry;
            if (cached.isFresh(now)) {
                return cached.routes();
            }

            List<RouteInfo> routes = List.copyOf(loadRouteInfos());
            routeCacheEntry = new RouteCacheEntry(routes, now + ROUTE_CACHE_TTL.toMillis());
            log.info("Seoul bus route cache loaded. routeCount={}", routes.size());
            return routes;
        }
    }

    private List<RouteInfo> loadRouteInfos() throws Exception {
        List<RouteInfo> routes = new ArrayList<>();
        Integer totalCount = null;

        for (int startIndex = ROUTE_SEARCH_START_INDEX;
             startIndex <= ROUTE_SEARCH_MAX_INDEX && (totalCount == null || startIndex <= totalCount);
             startIndex += ROUTE_SEARCH_PAGE_SIZE) {
            int endIndex = startIndex + ROUTE_SEARCH_PAGE_SIZE - 1;
            int currentStartIndex = startIndex;
            int currentEndIndex = endIndex;
            JsonNode rootNode = requestLegacyBusJson("routeSearch", uriBuilder -> uriBuilder
                            .scheme("http")
                            .host("openapi.seoul.go.kr")
                            .port(8088)
                            .pathSegment(seoulBusRouteApiKey, "json", "busRteInfo",
                                    String.valueOf(currentStartIndex),
                                    String.valueOf(currentEndIndex))
                            .build());

            JsonNode responseNode = rootNode == null ? null : rootNode.get("busRteInfo");
            if (responseNode == null || responseNode.isMissingNode()) {
                return routes;
            }

            String resultCode = text(responseNode.path("RESULT"), "CODE");
            if (!isBlank(resultCode) && !"INFO-000".equals(resultCode)) {
                log.warn("Seoul bus route search returned non-ok result. status={}", resultCode);
                return routes;
            }

            if (totalCount == null) {
                totalCount = integer(text(responseNode, "list_total_count"));
            }

            JsonNode rowsNode = responseNode.get("row");
            if (rowsNode == null || !rowsNode.isArray()) {
                return routes;
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

                routes.add(new RouteInfo(
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

        return routes;
    }

    private ArrivalItem getRouteArrival(RouteStopMatch match) throws Exception {
        log.debug("Bus realtime getArrInfoByRoute request ready. requestedStopName={}, requestedRouteName={}, selectedStationName={}, stId={}, arsId={}, busRouteId={}, ord={}",
                match.stop().name(),
                match.routeName(),
                firstNotBlank(match.stationName(), match.stop().name()),
                match.nodeId(),
                match.arsId(),
                match.routeId(),
                match.stationOrder());
        String body = requestLegacyBusBody("arrivalByRoute", uriBuilder -> uriBuilder
                        .scheme("http")
                        .host("ws.bus.go.kr")
                        .path("/api/rest/arrive/getArrInfoByRoute")
                        .queryParam("serviceKey", publicDataApiKey.trim())
                        .queryParam("stId", match.nodeId())
                        .queryParam("busRouteId", match.routeId())
                        .queryParam("ord", match.stationOrder())
                        .queryParam("resultType", "json")
                        .build());

        if (isBlank(body)) {
            return ArrivalItem.empty(match);
        }

        String trimmedBody = body.trim();
        if (trimmedBody.startsWith("{")) {
            return parseJsonRouteArrival(trimmedBody, match);
        }

        return parseXmlRouteArrival(trimmedBody, match);
    }

    private JsonNode requestLegacyBusJson(String requestName, Function<UriBuilder, URI> uriFunction) throws Exception {
        return objectMapper.readTree(requestLegacyBusBody(requestName, uriFunction));
    }

    private String requestLegacyBusBody(String requestName, Function<UriBuilder, URI> uriFunction) throws Exception {
        ResponseEntity<byte[]> response = restClient.get()
                .uri(uriFunction)
                .retrieve()
                .toEntity(byte[].class);

        byte[] bodyBytes = response.getBody() == null ? new byte[0] : response.getBody();
        MediaType contentType = response.getHeaders().getContentType();
        Charset declaredCharset = contentType == null ? null : contentType.getCharset();
        DecodedBody decodedBody = decodeLegacyBusBody(bodyBytes, declaredCharset);

        return decodedBody.body();
    }

    private DecodedBody decodeLegacyBusBody(byte[] bodyBytes, Charset declaredCharset) throws CharacterCodingException {
        if (declaredCharset != null) {
            return new DecodedBody(decodeStrict(bodyBytes, declaredCharset), declaredCharset);
        }

        if (canDecode(bodyBytes, StandardCharsets.UTF_8)) {
            return new DecodedBody(new String(bodyBytes, StandardCharsets.UTF_8), StandardCharsets.UTF_8);
        }

        return new DecodedBody(decodeStrict(bodyBytes, LEGACY_BUS_CHARSET), LEGACY_BUS_CHARSET);
    }

    private String decodeStrict(byte[] bodyBytes, Charset charset) throws CharacterCodingException {
        CharsetDecoder decoder = charset.newDecoder()
                .onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
        return decoder.decode(ByteBuffer.wrap(bodyBytes)).toString();
    }

    private boolean canDecode(byte[] bodyBytes, Charset charset) {
        try {
            decodeStrict(bodyBytes, charset);
            return true;
        } catch (CharacterCodingException e) {
            return false;
        }
    }

    private ArrivalItem parseXmlRouteArrival(String xml, RouteStopMatch match) throws Exception {
        InputSource inputSource = new InputSource(new StringReader(xml));
        org.w3c.dom.Document document = createSecureDocumentBuilder().parse(inputSource);
        org.w3c.dom.Element root = document.getDocumentElement();

        String headerCode = firstText(root, "headerCd");
        String headerMessage = firstNotBlank(firstText(root, "headerMsg"), firstText(root, "returnAuthMsg"));
        if (!isBlank(headerCode) && !"0".equals(headerCode)) {
            log.warn("Seoul bus arrival returned non-ok header. status={}", headerCode);
            if (isRealtimeKeyScopeError(headerCode, headerMessage)) {
                throw new BusRealtimeKeyScopeException("BUS_REALTIME_KEY_SCOPE_ERROR");
            }
            return ArrivalItem.empty(match);
        }

        org.w3c.dom.NodeList itemNodes = root.getElementsByTagName("itemList");
        if (itemNodes.getLength() == 0 || !(itemNodes.item(0) instanceof org.w3c.dom.Element itemElement)) {
            log.debug("Seoul bus arrival response parsed. headerCd={}, headerMsg={}, arrmsg1={}, arrmsg2={}, busType1={}, busType2={}",
                    headerCode, headerMessage, null, null, null, null);
            return ArrivalItem.empty(match);
        }

        log.debug("Seoul bus arrival response parsed. headerCd={}, headerMsg={}, arrmsg1={}, arrmsg2={}, busType1={}, busType2={}",
                headerCode,
                headerMessage,
                firstText(itemElement, "arrmsg1"),
                firstText(itemElement, "arrmsg2"),
                firstText(itemElement, "busType1"),
                firstText(itemElement, "busType2"));

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
        String headerMessage = firstNotBlank(text(headerNode, "headerMsg"), text(headerNode, "returnAuthMsg"));
        if (!isBlank(headerCode) && !"0".equals(headerCode)) {
            log.warn("Seoul bus arrival returned non-ok header. status={}", headerCode);
            if (isRealtimeKeyScopeError(headerCode, headerMessage)) {
                throw new BusRealtimeKeyScopeException("BUS_REALTIME_KEY_SCOPE_ERROR");
            }
            return ArrivalItem.empty(match);
        }

        JsonNode itemNode = firstItemList(rootNode);
        if (itemNode == null || itemNode.isMissingNode() || itemNode.isNull()) {
            log.debug("Seoul bus arrival response parsed. headerCd={}, headerMsg={}, arrmsg1={}, arrmsg2={}, busType1={}, busType2={}",
                    headerCode, headerMessage, null, null, null, null);
            return ArrivalItem.empty(match);
        }

        log.debug("Seoul bus arrival response parsed. headerCd={}, headerMsg={}, arrmsg1={}, arrmsg2={}, busType1={}, busType2={}",
                headerCode,
                headerMessage,
                text(itemNode, "arrmsg1"),
                text(itemNode, "arrmsg2"),
                text(itemNode, "busType1"),
                text(itemNode, "busType2"));

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

    private record RouteInfo(
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

    private record RouteCacheEntry(List<RouteInfo> routes, long expiresAtMillis) {
        private static RouteCacheEntry empty() {
            return new RouteCacheEntry(List.of(), 0);
        }

        private boolean isFresh(long nowMillis) {
            return expiresAtMillis > nowMillis;
        }
    }

    private record StopCacheEntry(List<StopCandidate> candidates, long expiresAtMillis) {
        private boolean isFresh(long nowMillis) {
            return expiresAtMillis > nowMillis;
        }
    }

    private record DecodedBody(String body, Charset charset) {
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
