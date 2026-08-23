package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.KakaoKeywordSearchResponseDTO;
import com.baegopa.onestep.dto.KakaoPlaceDTO;
import com.baegopa.onestep.service.IKakaoMapService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import java.util.Collections;
import java.util.List;

@Slf4j
@Service
public class KakaoMapService implements IKakaoMapService {

    private static final String KAKAO_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
    private static final int SEARCH_SIZE = 10;

    private final RestClient restClient = RestClient.create();

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

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
