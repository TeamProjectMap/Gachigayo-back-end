package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.controller.HelpRequestController;
import com.baegopa.onestep.dto.KakaoPlaceDTO;
import com.baegopa.onestep.service.IHelpRequestService;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.anything;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SafetyCenterTests {
    private static final String PATH = "/help-request/nearby-safety-center";
    private MockHttpSession user() {
        var session = new MockHttpSession(); session.setAttribute("SS_USER_ID", 7L); session.setAttribute("SS_USER_ROLE", "USER"); return session;
    }
    private KakaoMapService service(RestClient client) {
        var service = new KakaoMapService(mock(PlaceSearchService.class));
        ReflectionTestUtils.setField(service, "restClient", client);
        ReflectionTestUtils.setField(service, "kakaoRestApiKey", "fake-test-key");
        return service;
    }
    @Test void choosesClosestPoliceFacilityWithPhoneAcrossAllThreeQueries() {
        var builder = RestClient.builder(); var server = MockRestServiceServer.bindTo(builder).build();
        for (String query : java.util.List.of("지구대", "파출소", "경찰서")) {
            server.expect(requestTo(org.hamcrest.Matchers.containsString("keyword.json")))
                    .andExpect(queryParam("x", "126.97")).andExpect(queryParam("y", "37.56"))
                    .andExpect(queryParam("sort", "distance")).andExpect(queryParam("radius", "20000"))
                    .andExpect(header("Authorization", "KakaoAK fake-test-key"))
                    .andRespond(withSuccess("""
                    {"documents":[
                    {"id":"no-phone","place_name":"가상지구대","category_name":"경찰","distance":"5","phone":""},
                    {"id":"far","place_name":"가상파출소","category_name":"경찰","distance":"300","phone":"02-0000-0000"},
                    {"id":"near","place_name":"가상경찰서","category_name":"경찰","distance":"100","phone":"02-0000-0001"},
                    {"id":"park","place_name":"가상공원","category_name":"공원","distance":"1","phone":"02-0000-0002"}]}
                    """, MediaType.APPLICATION_JSON));
        }
        var result = service(builder.build()).searchNearbySafetyCenter("126.97", "37.56");
        assertEquals("near", result.getId()); assertEquals("02-0000-0001", result.getPhone()); server.verify();
    }
    @Test void noResultsDoesNotInventAFacility() {
        var builder = RestClient.builder(); var server = MockRestServiceServer.bindTo(builder).build();
        for (int i=0; i<3; i++) server.expect(anything()).andRespond(withSuccess("{\"documents\":[]}", MediaType.APPLICATION_JSON));
        assertNull(service(builder.build()).searchNearbySafetyCenter("126.97", "37.56")); server.verify();
    }
    @Test void providerFailureIsNotReportedAsARealFacility() {
        var builder = RestClient.builder(); var server = MockRestServiceServer.bindTo(builder).build();
        server.expect(anything()).andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        assertThrows(org.springframework.web.client.RestClientResponseException.class,
                () -> service(builder.build()).searchNearbySafetyCenter("126.97", "37.56")); server.verify();
    }
    @Test void authenticationAndInvalidCoordinatesNeverReachSearchService() throws Exception {
        var service = mock(IHelpRequestService.class); var mvc = MockMvcBuilders.standaloneSetup(new HelpRequestController(service)).build();
        mvc.perform(get(PATH)).andExpect(jsonPath("$.success").value(false));
        for (String latitude : java.util.List.of("NaN", "91", "invalid"))
            mvc.perform(get(PATH).session(user()).param("latitude", latitude).param("longitude", "126.97"))
                    .andExpect(jsonPath("$.success").value(false));
        verifyNoInteractions(service);
    }
    @Test void controllerPassesCoordinatesAndReturnsActualPhoneAvailability() throws Exception {
        var service = mock(IHelpRequestService.class); var center = new KakaoPlaceDTO();
        center.setPlaceName("가상파출소"); center.setPhone("02-0000-0000");
        when(service.getNearbySafetyCenter("126.97", "37.56")).thenReturn(center);
        var mvc = MockMvcBuilders.standaloneSetup(new HelpRequestController(service)).build();
        mvc.perform(get(PATH).session(user()).param("latitude", "37.56").param("longitude", "126.97"))
                .andExpect(jsonPath("$.success").value(true)).andExpect(jsonPath("$.hasPhone").value(true))
                .andExpect(jsonPath("$.safetyCenter.phone").value("02-0000-0000"));
        center.setPhone("");
        mvc.perform(get(PATH).session(user()).param("latitude", "37.56").param("longitude", "126.97"))
                .andExpect(jsonPath("$.hasPhone").value(false));
    }
}
