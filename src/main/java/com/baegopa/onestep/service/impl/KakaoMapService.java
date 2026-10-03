package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.KakaoKeywordSearchResponseDTO;
import com.baegopa.onestep.dto.KakaoPlaceDTO;
import com.baegopa.onestep.dto.KakaoPlaceDocumentDTO;
import com.baegopa.onestep.dto.KakaoRouteSearchResultDTO;
import com.baegopa.onestep.dto.PublicTransitRouteDTO;
import com.baegopa.onestep.dto.PublicTransitRouteResultDTO;
import com.baegopa.onestep.dto.PublicTransitStepDTO;
import com.baegopa.onestep.dto.TransitVehicleDTO;
import com.baegopa.onestep.dto.WalkingRouteResultDTO;
import com.baegopa.onestep.dto.WalkingStepDTO;
import com.baegopa.onestep.service.IKakaoMapService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;
import tools.jackson.databind.JsonNode;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class KakaoMapService implements IKakaoMapService {

    private static final String KAKAO_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
    private static final String KAKAO_PUBLIC_TRANSIT_URL = "https://dapi.kakao.com/v2/routing/publictraffic";
    private static final String KAKAO_WALKING_URL = "https://dapi.kakao.com/v2/routing/walk";
    private static final String KAKAO_COORD_TO_ADDRESS_URL = "https://dapi.kakao.com/v2/local/geo/coord2address.json";
    private static final int SEARCH_SIZE = 10;
    private static final int SAFETY_CENTER_SEARCH_SIZE = 15;
    private static final int SAFETY_CENTER_RADIUS_METERS = 20000;
    private static final String PUBLIC_OFFICE_CATEGORY_GROUP_CODE = "PO3";
    private static final String ROUTE_MODE_ACCESSIBLE = "ACCESSIBLE";
    private static final int ADDRESS_CACHE_LIMIT = 500;

    private final RestClient restClient = RestClient.create();
    private final Map<String, String> addressCache = new ConcurrentHashMap<>();

    @Value("${kakao.rest-api-key:}")
    private String kakaoRestApiKey;

    @Override
    public List<KakaoPlaceDTO> searchPlaces(String query) {
        if (isBlank(kakaoRestApiKey)) {
            log.error("Kakao REST API key is not configured. Check KAKAO_REST_API_KEY and Kakao Map API settings.");
            throw new IllegalStateException("Kakao REST API key is not configured.");
        }

        try {
            KakaoKeywordSearchResponseDTO responseDTO = restClient
                    .get()
                    .uri(KAKAO_KEYWORD_SEARCH_URL, uriBuilder -> uriBuilder
                            .queryParam("query", query)
                            .queryParam("size", SEARCH_SIZE)
                            .build())
                    .header("Authorization", "KakaoAK " + kakaoRestApiKey)
                    .retrieve()
                    .body(KakaoKeywordSearchResponseDTO.class);

            if (responseDTO == null || responseDTO.getDocuments() == null) {
                return Collections.emptyList();
            }

            return responseDTO.getDocuments().stream()
                    .map(documentDTO -> documentDTO.toPlaceDTO())
                    .toList();
        } catch (RestClientResponseException e) {
            log.error("Kakao place search failed. status={}. Check REST API key and Kakao Map API settings.",
                    e.getStatusCode());
            throw e;
        } catch (Exception e) {
            log.error("Kakao place search failed.", e);
            throw e;
        }
    }

    @Override
    public KakaoPlaceDTO searchNearbySafetyCenter(String longitude, String latitude) {
        if (isBlank(kakaoRestApiKey)) {
            log.error("Kakao REST API key is not configured. Check KAKAO_REST_API_KEY and Kakao Map API settings.");
            throw new IllegalStateException("Kakao REST API key is not configured.");
        }

        Map<String, KakaoPlaceDTO> candidates = new LinkedHashMap<>();
        for (String query : List.of("지구대", "파출소", "경찰서")) {
            for (KakaoPlaceDTO place : searchSafetyCenterPlaces(query, longitude, latitude)) {
                if (isSafetyCenter(place)) {
                    candidates.putIfAbsent(place.getId(), place);
                }
            }
        }

        return candidates.values().stream()
                .sorted((left, right) -> {
                    boolean leftHasPhone = !isBlank(left.getPhone());
                    boolean rightHasPhone = !isBlank(right.getPhone());
                    if (leftHasPhone != rightHasPhone) {
                        return leftHasPhone ? -1 : 1;
                    }
                    return Integer.compare(parseDistance(left.getDistance()), parseDistance(right.getDistance()));
                })
                .findFirst()
                .orElse(null);
    }

    @Override
    public KakaoRouteSearchResultDTO searchRoutes(String startLongitude,
                                                  String startLatitude,
                                                  String endLongitude,
                                                  String endLatitude,
                                                  String destinationName) {
        if (isBlank(kakaoRestApiKey)) {
            log.error("Kakao REST API key is not configured. Check KAKAO_REST_API_KEY and Kakao Map API settings.");
            throw new IllegalStateException("Kakao REST API key is not configured.");
        }

        KakaoRouteSearchResultDTO resultDTO = new KakaoRouteSearchResultDTO();
        resultDTO.setPublicTransit(searchPublicTransitRoutes(
                startLongitude, startLatitude, endLongitude, endLatitude, destinationName));
        resultDTO.setWalking(searchWalkingRoute(
                startLongitude, startLatitude, endLongitude, endLatitude, destinationName));

        return resultDTO;
    }

    private List<KakaoPlaceDTO> searchSafetyCenterPlaces(String query, String longitude, String latitude) {
        try {
            KakaoKeywordSearchResponseDTO responseDTO = restClient
                    .get()
                    .uri(KAKAO_KEYWORD_SEARCH_URL, uriBuilder -> uriBuilder
                            .queryParam("query", query)
                            .queryParam("category_group_code", PUBLIC_OFFICE_CATEGORY_GROUP_CODE)
                            .queryParam("x", longitude)
                            .queryParam("y", latitude)
                            .queryParam("radius", SAFETY_CENTER_RADIUS_METERS)
                            .queryParam("sort", "distance")
                            .queryParam("size", SAFETY_CENTER_SEARCH_SIZE)
                            .build())
                    .header("Authorization", "KakaoAK " + kakaoRestApiKey)
                    .retrieve()
                    .body(KakaoKeywordSearchResponseDTO.class);

            if (responseDTO == null || responseDTO.getDocuments() == null) {
                return Collections.emptyList();
            }

            return responseDTO.getDocuments().stream()
                    .map(KakaoPlaceDocumentDTO::toPlaceDTO)
                    .toList();
        } catch (RestClientResponseException e) {
            log.error("Kakao safety center search failed. status={}.", e.getStatusCode());
            throw e;
        } catch (Exception e) {
            log.error("Kakao safety center search failed.", e);
            throw e;
        }
    }

    private boolean isSafetyCenter(KakaoPlaceDTO place) {
        if (place == null) {
            return false;
        }

        String placeName = place.getPlaceName() == null ? "" : place.getPlaceName();
        String categoryName = place.getCategoryName() == null ? "" : place.getCategoryName();
        String value = placeName + " " + categoryName;

        return value.contains("지구대") || value.contains("파출소") || value.contains("경찰서") || value.contains("경찰");
    }

    private int parseDistance(String distance) {
        if (isBlank(distance)) {
            return Integer.MAX_VALUE;
        }

        try {
            return Integer.parseInt(distance.trim());
        } catch (NumberFormatException e) {
            return Integer.MAX_VALUE;
        }
    }

    private PublicTransitRouteResultDTO searchPublicTransitRoutes(String startLongitude,
                                                                  String startLatitude,
                                                                  String endLongitude,
                                                                  String endLatitude,
                                                                  String destinationName) {
        try {
            JsonNode responseNode = restClient
                    .get()
                    .uri(KAKAO_PUBLIC_TRANSIT_URL, uriBuilder -> uriBuilder
                            .queryParam("start_x", startLongitude)
                            .queryParam("start_y", startLatitude)
                            .queryParam("end_x", endLongitude)
                            .queryParam("end_y", endLatitude)
                            .queryParam("s_name", "현재 위치")
                            .queryParam("e_name", isBlank(destinationName) ? "도착" : destinationName)
                            .build())
                    .header("Authorization", "KakaoAK " + kakaoRestApiKey)
                    .retrieve()
                    .body(JsonNode.class);

            return toPublicTransitResult(responseNode);
        } catch (RestClientResponseException e) {
            log.error("Kakao public transit route search failed. status={}.", e.getStatusCode());
            throw e;
        } catch (Exception e) {
            log.error("Kakao public transit route search failed.", e);
            throw e;
        }
    }

    private WalkingRouteResultDTO searchWalkingRoute(String startLongitude,
                                                     String startLatitude,
                                                     String endLongitude,
                                                     String endLatitude,
                                                     String destinationName) {
        try {
            JsonNode responseNode = restClient
                    .get()
                    .uri(KAKAO_WALKING_URL, uriBuilder -> uriBuilder
                            .queryParam("start_x", startLongitude)
                            .queryParam("start_y", startLatitude)
                            .queryParam("end_x", endLongitude)
                            .queryParam("end_y", endLatitude)
                            .queryParam("s_name", "현재 위치")
                            .queryParam("e_name", isBlank(destinationName) ? "도착" : destinationName)
                            .queryParam("route_mode", ROUTE_MODE_ACCESSIBLE)
                            .build())
                    .header("Authorization", "KakaoAK " + kakaoRestApiKey)
                    .retrieve()
                    .body(JsonNode.class);

            return toWalkingResult(responseNode);
        } catch (RestClientResponseException e) {
            log.error("Kakao walking route search failed. status={}.", e.getStatusCode());
            throw e;
        } catch (Exception e) {
            log.error("Kakao walking route search failed.", e);
            throw e;
        }
    }

    /**
     * 좌표 -> 주소 변환
     * 보호자 화면은 이동 중 15초마다 다시 물어보는데 이용자가 멈춰 있으면 좌표가 그대로
     */
    @Override
    public String searchAddressByCoordinate(String longitude, String latitude) {
        if (isBlank(kakaoRestApiKey) || isBlank(longitude) || isBlank(latitude)) {
            return null;
        }

        String cacheKey = longitude + "," + latitude;
        String cachedAddress = addressCache.get(cacheKey);

        if (cachedAddress != null) {
            return cachedAddress;
        }

        try {
            JsonNode responseNode = restClient
                    .get()
                    .uri(KAKAO_COORD_TO_ADDRESS_URL, uriBuilder -> uriBuilder
                            .queryParam("x", longitude)
                            .queryParam("y", latitude)
                            .build())
                    .header("Authorization", "KakaoAK " + kakaoRestApiKey)
                    .retrieve()
                    .body(JsonNode.class);

            String address = toAddressName(responseNode);

            if (address != null) {
                // 오래 돌아도 메모리가 계속 늘지 않도록 일정 개수가 넘으면 비운다
                if (addressCache.size() >= ADDRESS_CACHE_LIMIT) {
                    addressCache.clear();
                }

                addressCache.put(cacheKey, address);
            }

            return address;
        } catch (Exception e) {
            // 주소 변환은 있으면 좋은 정보라 실패해도 화면을 막지 않는다
            log.warn("Kakao coord to address failed. x={}, y={}", longitude, latitude, e);
            return null;
        }
    }

    /** 도로명 주소를 먼저 쓰고, 없으면 지번 주소 */
    private String toAddressName(JsonNode responseNode) {
        if (responseNode == null) {
            return null;
        }

        JsonNode documentsNode = responseNode.path("documents");

        if (!documentsNode.isArray() || documentsNode.isEmpty()) {
            return null;
        }

        JsonNode documentNode = documentsNode.get(0);
        String roadAddress = text(documentNode.path("road_address"), "address_name");

        if (!isBlank(roadAddress)) {
            return roadAddress;
        }

        return text(documentNode.path("address"), "address_name");
    }

    private PublicTransitRouteResultDTO toPublicTransitResult(JsonNode responseNode) {
        PublicTransitRouteResultDTO resultDTO = new PublicTransitRouteResultDTO();
        String status = text(responseNode, "status");
        resultDTO.setStatus(status);
        resultDTO.setAvailable("OK".equals(status));
        resultDTO.setMessage(getPublicTransitMessage(status));

        if (!resultDTO.isAvailable()) {
            return resultDTO;
        }

        JsonNode routesNode = responseNode.path("routes");
        if (!routesNode.isArray()) {
            resultDTO.setAvailable(false);
            resultDTO.setMessage("검색 가능한 대중교통 경로가 없습니다.");
            return resultDTO;
        }

        for (JsonNode routeNode : routesNode) {
            JsonNode propertiesNode = routeNode.path("properties");
            PublicTransitRouteDTO routeDTO = new PublicTransitRouteDTO();
            routeDTO.setType(text(propertiesNode, "type"));
            routeDTO.setTotalDistance(integer(propertiesNode, "totalDistance"));
            routeDTO.setTotalTime(integer(propertiesNode, "totalTime"));
            routeDTO.setTransfers(integer(propertiesNode, "transfers"));
            routeDTO.setFare(integer(propertiesNode.path("fare"), "value"));
            routeDTO.setSteps(toPublicTransitSteps(routeNode.path("steps")));

            resultDTO.getRoutes().add(routeDTO);
        }

        return resultDTO;
    }

    private List<PublicTransitStepDTO> toPublicTransitSteps(JsonNode stepsNode) {
        if (!stepsNode.isArray()) {
            return Collections.emptyList();
        }

        return toStream(stepsNode).map(stepNode -> {
            JsonNode propertiesNode = stepNode.path("properties");
            PublicTransitStepDTO stepDTO = new PublicTransitStepDTO();
            stepDTO.setGuidance(text(propertiesNode, "guidance"));
            stepDTO.setType(getPublicTransitStepType(propertiesNode));
            stepDTO.setDistance(integer(propertiesNode, "distance"));
            stepDTO.setTime(integer(propertiesNode, "time"));
            stepDTO.setPathPoints(toPublicTransitPathPoints(stepNode.path("path").path("points")));

            JsonNode stopsNode = propertiesNode.path("stops");
            if (stopsNode.isArray()) {
                for (JsonNode stopNode : stopsNode) {
                    String stopName = text(stopNode, "name");
                    if (!isBlank(stopName)) {
                        stepDTO.getStops().add(stopName);
                    }
                }
            }

            JsonNode vehiclesNode = propertiesNode.path("vehicles");
            if (vehiclesNode.isArray()) {
                for (JsonNode vehicleNode : vehiclesNode) {
                    TransitVehicleDTO vehicleDTO = new TransitVehicleDTO();
                    vehicleDTO.setName(text(vehicleNode, "name"));
                    vehicleDTO.setType(text(vehicleNode, "type"));
                    stepDTO.getVehicles().add(vehicleDTO);
                }
            }

            return stepDTO;
        }).toList();
    }

    private String getPublicTransitStepType(JsonNode propertiesNode) {
        String type = text(propertiesNode, "type");

        if (!isBlank(type)) {
            return type;
        }

        JsonNode vehiclesNode = propertiesNode.path("vehicles");
        if (vehiclesNode.isArray() && !vehiclesNode.isEmpty()) {
            return text(vehiclesNode.get(0), "type");
        }

        return "WALKING";
    }

    private WalkingRouteResultDTO toWalkingResult(JsonNode responseNode) {
        WalkingRouteResultDTO resultDTO = new WalkingRouteResultDTO();
        String status = text(responseNode, "status");
        resultDTO.setStatus(status);
        resultDTO.setAvailable("OK".equals(status));
        resultDTO.setMessage(getWalkingMessage(status));

        if (!resultDTO.isAvailable()) {
            return resultDTO;
        }

        JsonNode propertiesNode = responseNode.path("route").path("properties");
        resultDTO.setTotalDistance(integer(propertiesNode, "totalDistance"));
        resultDTO.setTotalTime(integer(propertiesNode, "totalTime"));
        resultDTO.setSteps(toWalkingSteps(responseNode.path("route").path("legs")));

        return resultDTO;
    }

    private List<WalkingStepDTO> toWalkingSteps(JsonNode legsNode) {
        if (!legsNode.isArray()) {
            return Collections.emptyList();
        }

        return toStream(legsNode)
                .flatMap(legNode -> toStream(legNode.path("steps")))
                .map(stepNode -> {
                    JsonNode propertiesNode = stepNode.path("properties");
                    WalkingStepDTO stepDTO = new WalkingStepDTO();
                    stepDTO.setGuidance(text(propertiesNode, "guidance"));
                    stepDTO.setDistance(integer(propertiesNode, "distance"));
                    stepDTO.setTime(integer(propertiesNode, "time"));
                    stepDTO.setLongitude(decimal(propertiesNode, "x"));
                    stepDTO.setLatitude(decimal(propertiesNode, "y"));
                    stepDTO.setPathPoints(toWalkingPathPoints(stepNode.path("path").path("points")));

                    return stepDTO;
                }).toList();
    }

    private List<PublicTransitStepDTO.PathPointDTO> toPublicTransitPathPoints(JsonNode pointsNode) {
        if (!pointsNode.isArray()) {
            return Collections.emptyList();
        }

        return toStream(pointsNode)
                .map(this::toPublicTransitPathPoint)
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    private PublicTransitStepDTO.PathPointDTO toPublicTransitPathPoint(JsonNode pointNode) {
        if (!isValidPathPointNode(pointNode)) {
            return null;
        }

        PublicTransitStepDTO.PathPointDTO pointDTO = new PublicTransitStepDTO.PathPointDTO();
        pointDTO.setLongitude(pointNode.get(0).asDouble());
        pointDTO.setLatitude(pointNode.get(1).asDouble());

        return pointDTO;
    }

    private List<WalkingStepDTO.PathPointDTO> toWalkingPathPoints(JsonNode pointsNode) {
        if (!pointsNode.isArray()) {
            return Collections.emptyList();
        }

        return toStream(pointsNode)
                .map(this::toWalkingPathPoint)
                .filter(java.util.Objects::nonNull)
                .toList();
    }

    private WalkingStepDTO.PathPointDTO toWalkingPathPoint(JsonNode pointNode) {
        if (!isValidPathPointNode(pointNode)) {
            return null;
        }

        WalkingStepDTO.PathPointDTO pointDTO = new WalkingStepDTO.PathPointDTO();
        pointDTO.setLongitude(pointNode.get(0).asDouble());
        pointDTO.setLatitude(pointNode.get(1).asDouble());

        return pointDTO;
    }

    private boolean isValidPathPointNode(JsonNode pointNode) {
        if (pointNode == null || !pointNode.isArray() || pointNode.size() < 2
                || !pointNode.get(0).isNumber() || !pointNode.get(1).isNumber()) {
            return false;
        }

        double longitude = pointNode.get(0).asDouble();
        double latitude = pointNode.get(1).asDouble();

        return Double.isFinite(longitude) && Double.isFinite(latitude)
                && longitude >= -180 && longitude <= 180
                && latitude >= -90 && latitude <= 90;
    }

    private String getPublicTransitMessage(String status) {
        if ("OK".equals(status)) {
            return "대중교통 경로를 찾았습니다.";
        }

        if ("STARTNODES_NULL".equals(status)) {
            return "출발지 주변 대중교통 경로를 찾기 어렵습니다.";
        }

        if ("ENDNODES_NULL".equals(status)) {
            return "목적지 주변 대중교통 경로를 찾기 어렵습니다.";
        }

        if ("EQUAL_POINTS".equals(status)) {
            return "출발지와 목적지가 같습니다.";
        }

        if ("INVALID_REQUEST".equals(status)) {
            return "대중교통 경로 요청 정보가 올바르지 않습니다.";
        }

        if ("NO_RESULTS".equals(status)) {
            return "검색 가능한 대중교통 경로가 없습니다.";
        }

        return "대중교통 경로를 찾지 못했습니다.";
    }

    private String getWalkingMessage(String status) {
        if ("OK".equals(status)) {
            return "도보 경로를 찾았습니다.";
        }

        if ("SAME_POINT".equals(status)) {
            return "출발지와 목적지가 같습니다.";
        }

        if ("START_LINK_NOT_FOUND".equals(status)) {
            return "출발지 주변 도보 경로를 찾기 어렵습니다.";
        }

        if ("END_LINK_NOT_FOUND".equals(status)) {
            return "목적지 주변 도보 경로를 찾기 어렵습니다.";
        }

        if ("TOO_MANY_SEARCH_LINK".equals(status)) {
            return "도보 경로 검색 범위가 너무 큽니다.";
        }

        if ("TOO_FAR_AWAY".equals(status)) {
            return "도보로 이동하기에는 거리가 너무 멉니다.";
        }

        if ("ROUTE_RESULT_NOT_FOUND".equals(status)) {
            return "검색 가능한 도보 경로가 없습니다.";
        }

        return "도보 경로를 찾지 못했습니다.";
    }

    private java.util.stream.Stream<JsonNode> toStream(JsonNode node) {
        if (node == null || !node.isArray()) {
            return java.util.stream.Stream.empty();
        }

        return java.util.stream.Stream.of(node).flatMap(arrayNode -> {
            java.util.List<JsonNode> nodes = new java.util.ArrayList<>();
            arrayNode.forEach(nodes::add);
            return nodes.stream();
        });
    }

    private String text(JsonNode node, String fieldName) {
        JsonNode valueNode = node == null ? null : node.get(fieldName);

        return valueNode == null || valueNode.isNull() ? null : valueNode.asText();
    }

    private Integer integer(JsonNode node, String fieldName) {
        JsonNode valueNode = node == null ? null : node.get(fieldName);

        return valueNode == null || !valueNode.isNumber() ? null : valueNode.asInt();
    }

    private Double decimal(JsonNode node, String fieldName) {
        JsonNode valueNode = node == null ? null : node.get(fieldName);

        return valueNode == null || !valueNode.isNumber() ? null : valueNode.asDouble();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
