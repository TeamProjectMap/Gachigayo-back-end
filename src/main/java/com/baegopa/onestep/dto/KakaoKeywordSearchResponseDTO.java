package com.baegopa.onestep.dto;

import lombok.Getter;
import lombok.Setter;

import java.util.ArrayList;
import java.util.List;

@Getter
@Setter
public class KakaoKeywordSearchResponseDTO {

    private List<KakaoPlaceDocumentDTO> documents = new ArrayList<>();
}