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
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;

@Service
public class PlaceSearchService {
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
