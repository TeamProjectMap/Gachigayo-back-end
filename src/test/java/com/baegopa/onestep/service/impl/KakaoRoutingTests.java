package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.*;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

class KakaoRoutingTests {
    private final KakaoMapService service = new KakaoMapService(mock(PlaceSearchService.class));
    private final JsonMapper mapper = JsonMapper.builder().build();

    @Test void ordinaryWalkingUsesBroadFirstInsteadOfRestrictiveAccessibleMode() {
        var builder = org.springframework.web.client.RestClient.builder();
        var server = org.springframework.test.web.client.MockRestServiceServer.bindTo(builder).build();
        server.expect(org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo(org.hamcrest.Matchers.containsString("/routing/publictraffic")))
                .andRespond(org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess("{\"status\":\"NO_RESULTS\"}", org.springframework.http.MediaType.APPLICATION_JSON));
        server.expect(org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo(org.hamcrest.Matchers.containsString("/routing/walk")))
                .andExpect(org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam("route_mode", "BROAD_FIRST"))
                .andRespond(org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess("""
                    {"status":"OK","route":{"properties":{"totalDistance":100,"totalTime":80},"legs":[{"steps":[{"properties":{"guidance":"직진","distance":100,"time":80},"path":{"points":[[126.83,37.55],[126.84,37.56]]}}]}]}}
                    """, org.springframework.http.MediaType.APPLICATION_JSON));
        ReflectionTestUtils.setField(service, "restClient", builder.build());
        ReflectionTestUtils.setField(service, "kakaoRestApiKey", "test-key");
        var result = service.searchRoutes("126.83", "37.55", "126.84", "37.56", "목적지");
        assertTrue(result.getWalking().isAvailable());
        assertEquals(2, result.getWalking().getSteps().get(0).getPathPoints().size());
        server.verify();
    }

    @Test void readsOfficialWalkingResponseAndActualCoordinates() {
        WalkingRouteResultDTO result = ReflectionTestUtils.invokeMethod(service, "toWalkingResult", mapper.readTree("""
            {"status":"OK","route":{"properties":{"totalDistance":120,"totalTime":90},"legs":[{"steps":[
            {"properties":{"guidance":"횡단보도를 건너세요","distance":120,"time":90,"x":127.001,"y":37.001},
            "path":{"points":[[127.0,37.0],[127.001,37.001]]}}
            ]}]}}
            """));
        assertNotNull(result); assertTrue(result.isAvailable()); assertEquals(90, result.getTotalTime());
        assertEquals("횡단보도를 건너세요", result.getSteps().get(0).getGuidance());
        assertEquals(2, result.getSteps().get(0).getPathPoints().size());
    }

    @Test void keepsWalkingBusSubwaySequence() {
        PublicTransitRouteResultDTO result = ReflectionTestUtils.invokeMethod(service, "toPublicTransitResult", mapper.readTree("""
            {"status":"OK","routes":[{"properties":{"type":"PUBLIC_TRANSIT","totalTime":500,"totalDistance":1000,"transfers":1,"fare":{"value":1500}},"steps":[
            {"properties":{"type":"WALKING","guidance":"정류장까지 이동","time":60,"distance":50}},
            {"properties":{"type":"BUS","time":180,"distance":450,"vehicles":[{"type":"BUS","name":"400"}],"stops":[{"name":"시청"},{"name":"종로"}]}},
            {"properties":{"type":"WALKING","time":20,"distance":50}},
            {"properties":{"type":"SUBWAY","time":180,"distance":400}},
            {"properties":{"type":"WALKING","time":60,"distance":50}}
            ]}]}
            """));
        assertNotNull(result); assertTrue(result.isAvailable());
        assertEquals(java.util.List.of("WALKING","BUS","WALKING","SUBWAY","WALKING"), result.getRoutes().get(0).getSteps().stream().map(PublicTransitStepDTO::getType).toList());
        assertEquals(1500, result.getRoutes().get(0).getFare());
    }

    @Test void errorResponseDoesNotCreateARoute() {
        WalkingRouteResultDTO result = ReflectionTestUtils.invokeMethod(service, "toWalkingResult", mapper.readTree("{\"status\":\"ZERO_RESULTS\"}"));
        assertNotNull(result); assertFalse(result.isAvailable()); assertTrue(result.getSteps().isEmpty());
    }
}
