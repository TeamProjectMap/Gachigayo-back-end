package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.KakaoPlaceDTO;
import com.baegopa.onestep.dto.KakaoPlaceDocumentDTO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.net.http.HttpClient;
import java.text.Normalizer;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@Service
public class PlaceSearchService {

    /**
     * 카카오 키워드 검색은 장소 이름뿐 아니라 주소도 맞춰 본다. '발산'을 찾으면 '내발산동' 주소인
     * 가게들이 첫 페이지를 채워서 '발산역'이 밀려난다. 그래서 첫 페이지 요청에는 카카오 1~3쪽을
     * 한 번에 받아 이름이 맞는 장소를 먼저 보여준다. 다음 페이지(page ≥ 2)는 카카오 page+2쪽이다.
     */
    private static final int FIRST_PAGE_KAKAO_PAGES = 3;
    private static final int KAKAO_MAX_PAGE = 45;

    private final RestClient client;
    private final String key;
    private final JsonMapper mapper = JsonMapper.builder().build();

    @org.springframework.beans.factory.annotation.Autowired
    public PlaceSearchService(@Value("${kakao.rest-api-key:}") String key) {
        this.key = key;
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(Duration.ofSeconds(10));
        client = RestClient.builder().requestFactory(factory).baseUrl("https://dapi.kakao.com").build();
    }

    PlaceSearchService(RestClient client, String key) { this.client = client; this.key = key; }

    public record Result(List<KakaoPlaceDTO> places, int totalCount, boolean end) { }

    public Result search(String query, int page, Double longitude, Double latitude, boolean distance) {
        if (key.isBlank()) throw new IllegalStateException("Place search is not configured");

        if (page > 1) {
            int kakaoPage = page + FIRST_PAGE_KAKAO_PAGES - 1;
            if (kakaoPage > KAKAO_MAX_PAGE) return new Result(new ArrayList<>(), 0, true);
            return fetch(query, kakaoPage, longitude, latitude, distance);
        }

        // 역은 자주 가는 목적지인데, '발산'처럼 역 이름만 치면 카카오 상위 45개에 '발산역'이 없을 때가 있다.
        // 검색어가 '역'으로 끝나지 않으면 '검색어+역'도 동시에 찾아 이름이 맞는 것만 섞는다.
        CompletableFuture<Result> stationSearch = query.trim().endsWith("역") || query.trim().contains(" ")
                ? null
                : CompletableFuture.supplyAsync(() -> fetch(query.trim() + "역", 1, longitude, latitude, distance));

        Result first = fetch(query, 1, longitude, latitude, distance);
        List<Result> pages = new ArrayList<>(List.of(first));
        if (!first.end()) {
            // 2쪽부터는 동시에 받아 기다리는 시간을 줄인다
            List<CompletableFuture<Result>> more = new ArrayList<>();
            for (int p = 2; p <= FIRST_PAGE_KAKAO_PAGES; p++) {
                int kakaoPage = p;
                more.add(CompletableFuture.supplyAsync(() -> fetch(query, kakaoPage, longitude, latitude, distance)));
            }
            for (CompletableFuture<Result> future : more) {
                Result result = future.join();
                pages.add(result);
                if (result.end()) break;
            }
        }

        // 같은 장소가 두 번 오지 않게 id로 합친다 (카카오 순서 유지)
        Map<String, KakaoPlaceDTO> merged = new LinkedHashMap<>();
        for (Result result : pages) {
            for (KakaoPlaceDTO place : result.places()) {
                String id = place.getId() == null ? place.getPlaceName() + "|" + place.getRoadAddressName() : place.getId();
                merged.putIfAbsent(id, place);
            }
        }

        if (stationSearch != null) {
            try {
                for (KakaoPlaceDTO place : stationSearch.join().places()) {
                    // '검색어+역' 결과 중 이름에 원래 검색어가 들어 있는 것만 (주변 가게 등은 빼고)
                    if (nameRank(place.getPlaceName(), query) <= 2) {
                        String id = place.getId() == null ? place.getPlaceName() + "|" + place.getRoadAddressName() : place.getId();
                        merged.putIfAbsent(id, place);
                    }
                }
            } catch (Exception ignored) {
                // 보조 검색이 실패해도 원래 검색 결과는 그대로 보여준다
            }
        }

        boolean end = pages.get(pages.size() - 1).end();
        return new Result(rankByName(new ArrayList<>(merged.values()), query), first.totalCount(), end);
    }

    /**
     * 이름이 검색어와 맞는 장소를 먼저 둔다. 같은 단계 안에서는 카카오가 준 순서(정확도·거리)를 지킨다.
     * 0 이름이 같음(호선 표시 제외) · 1 이름이 검색어로 시작 · 2 이름에 검색어가 있음
     * · 3 띄어쓴 낱말이 모두 이름에 있음 · 4 그 밖(주소만 맞음 등)
     */
    static List<KakaoPlaceDTO> rankByName(List<KakaoPlaceDTO> places, String query) {
        List<KakaoPlaceDTO> ranked = new ArrayList<>(places);
        ranked.sort(Comparator.comparingInt(place -> nameRank(place.getPlaceName(), query)));   // 안정 정렬
        return ranked;
    }

    static int nameRank(String placeName, String query) {
        String q = normalize(query);
        String name = normalize(placeName);
        if (q.isEmpty()) return 4;
        String base = name.replaceAll("\\([^)]*\\)", "")
                .replaceAll("(?:\\d+호선|ktx|srt|경강선|경의중앙선|수인분당선|공항철도|김포골드라인)$", "");
        if (name.equals(q) || base.equals(q) || base.equals(q.endsWith("역") ? q : q + "역")) return 0;
        if (name.startsWith(q)) return 1;
        if (name.contains(q)) return 2;
        String[] tokens = query.trim().split("\\s+");
        if (tokens.length > 1) {
            boolean all = true;
            for (String token : tokens) {
                if (!name.contains(normalize(token))) { all = false; break; }
            }
            if (all) return 3;
        }
        return 4;
    }

    private static String normalize(String value) {
        if (value == null) return "";
        return Normalizer.normalize(value, Normalizer.Form.NFKC).toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
    }

    private Result fetch(String query, int page, Double longitude, Double latitude, boolean distance) {
        JsonNode root = client.get().uri(builder -> {
            builder.path("/v2/local/search/keyword.json").queryParam("query", query)
                    .queryParam("page", page).queryParam("size", 15);
            if (longitude != null && latitude != null) {
                builder.queryParam("x", longitude).queryParam("y", latitude);
                if (distance) builder.queryParam("sort", "distance");
            }
            return builder.build();
        }).header("Authorization", "KakaoAK " + key).retrieve().body(JsonNode.class);
        var places = new ArrayList<KakaoPlaceDTO>();
        if (root == null) return new Result(places, 0, true);
        for (var document : root.path("documents")) places.add(mapper.treeToValue(document, KakaoPlaceDocumentDTO.class).toPlaceDTO());
        return new Result(places, root.path("meta").path("total_count").asInt(),
                root.path("meta").path("is_end").asBoolean(true));
    }
}
