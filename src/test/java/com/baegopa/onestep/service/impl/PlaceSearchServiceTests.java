package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.controller.MapController;
import com.baegopa.onestep.service.IKakaoMapService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestClient;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PlaceSearchServiceTests {
    @Test void mapsOfficialKakaoFieldsAndPaginationMetadata() {
        var builder = RestClient.builder().baseUrl("https://dapi.kakao.com");
        var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo("https://dapi.kakao.com/v2/local/search/keyword.json?query=city&page=4&size=15&x=127.0&y=37.0&sort=distance"))
                .andExpect(header("Authorization", "KakaoAK test-key"))
                .andRespond(withSuccess("""
                    {"meta":{"total_count":31,"is_end":false},"documents":[{"id":"123","place_name":"시청","road_address_name":"세종대로 110","x":"126.9784","y":"37.5666","distance":"120"}]}
                    """, MediaType.APPLICATION_JSON));
        var result = new PlaceSearchService(builder.build(), "test-key").search("city", 2, 127d, 37d, true);
        assertEquals(31, result.totalCount()); assertFalse(result.end());
        assertEquals("시청", result.places().get(0).getPlaceName());
        assertEquals("126.9784", result.places().get(0).getLongitude());
        assertEquals("세종대로 110", result.places().get(0).getRoadAddressName());
        server.verify();
    }

    @Test void placesWhoseNameMatchesComeBeforeAddressOnlyMatches() {
        var station = place("1", "발산역 5호선");
        var shop = place("2", "레벨업PC방 내발산점");
        var address = place("3", "다이소 바다마트강서점");
        var mountain = place("4", "수명산");
        var ranked = PlaceSearchService.rankByName(List.of(shop, mountain, address, station), "발산");
        assertEquals(List.of("발산역 5호선", "레벨업PC방 내발산점", "수명산", "다이소 바다마트강서점"),
                ranked.stream().map(com.baegopa.onestep.dto.KakaoPlaceDTO::getPlaceName).toList());
        assertEquals(0, PlaceSearchService.nameRank("발산역 5호선", "발산역"));
        assertEquals(4, PlaceSearchService.nameRank("다이소 바다마트강서점", "발산"));
    }

    private static com.baegopa.onestep.dto.KakaoPlaceDTO place(String id, String name) {
        var place = new com.baegopa.onestep.dto.KakaoPlaceDTO();
        place.setId(id);
        place.setPlaceName(name);
        return place;
    }

    @Test void validatesAuthenticationRoleAndCoordinatesBeforeCallingProvider() throws Exception {
        var places = mock(PlaceSearchService.class);
        var mvc = MockMvcBuilders.standaloneSetup(new MapController(mock(IKakaoMapService.class), mock(com.baegopa.onestep.service.IEasyGuideService.class), places)).build();
        mvc.perform(get("/map/search").param("query", "시청")).andExpect(status().isOk()).andExpect(jsonPath("$.success").value(false));
        var session = new MockHttpSession(); session.setAttribute("SS_USER_ID", 1L); session.setAttribute("SS_USER_ROLE", "GUARDIAN");
        mvc.perform(get("/map/search").session(session).param("query", "시청")).andExpect(jsonPath("$.success").value(false));
        session.setAttribute("SS_USER_ROLE", "USER");
        mvc.perform(get("/map/search").session(session).param("query", "시청").param("page", "46")).andExpect(jsonPath("$.success").value(false));
        mvc.perform(get("/map/search").session(session).param("query", "시청").param("longitude", "NaN").param("latitude", "37")).andExpect(jsonPath("$.success").value(false));
        verifyNoInteractions(places);
        when(places.search("시청", 1, null, null, false)).thenReturn(new PlaceSearchService.Result(List.of(), 0, true));
        mvc.perform(get("/map/search").session(session).param("query", "시청"))
                .andExpect(jsonPath("$.success").value(true)).andExpect(jsonPath("$.end").value(true));
    }
}
