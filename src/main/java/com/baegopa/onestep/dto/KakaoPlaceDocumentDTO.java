package com.baegopa.onestep.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class KakaoPlaceDocumentDTO {

    private String id;

    @JsonProperty("place_name")
    private String placeName;

    @JsonProperty("category_name")
    private String categoryName;

    @JsonProperty("address_name")
    private String addressName;

    @JsonProperty("road_address_name")
    private String roadAddressName;

    @JsonProperty("x")
    private String longitude;

    @JsonProperty("y")
    private String latitude;

    private String phone;

    private String distance;

    @JsonProperty("place_url")
    private String placeUrl;

    public KakaoPlaceDTO toPlaceDTO() {
        KakaoPlaceDTO placeDTO = new KakaoPlaceDTO();
        placeDTO.setId(id);
        placeDTO.setPlaceName(placeName);
        placeDTO.setCategoryName(categoryName);
        placeDTO.setAddressName(addressName);
        placeDTO.setRoadAddressName(roadAddressName);
        placeDTO.setLongitude(longitude);
        placeDTO.setLatitude(latitude);
        placeDTO.setPhone(phone);
        placeDTO.setDistance(distance);
        placeDTO.setPlaceUrl(placeUrl);

        return placeDTO;
    }
}
