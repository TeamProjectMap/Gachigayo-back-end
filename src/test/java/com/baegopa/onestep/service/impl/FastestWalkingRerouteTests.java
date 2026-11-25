package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.controller.MapController;
import com.baegopa.onestep.dto.WalkingRouteResultDTO;
import com.baegopa.onestep.service.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class FastestWalkingRerouteTests {
    private final KakaoMapService service = new KakaoMapService(mock(PlaceSearchService.class));
    private MockRestServiceServer server() {
        var builder = RestClient.builder();
        var server = MockRestServiceServer.bindTo(builder).ignoreExpectOrder(true).build();
        ReflectionTestUtils.setField(service, "restClient", builder.build());
        ReflectionTestUtils.setField(service, "kakaoRestApiKey", "test-key");
        return server;
    }
    private String route(int time, int distance, String name) {
        return """
            {"status":"OK","route":{"properties":{"totalTime":%d,"totalDistance":%d},"legs":[{"steps":[
            {"properties":{"guidance":"%s","distance":%d,"time":%d},"path":{"points":[[126.832,37.551],[126.83,37.57]]}}]}]}}
            """.formatted(time,distance,name,distance,time);
    }
    private void expect(MockRestServiceServer server, String mode, String result) {
        server.expect(requestTo(org.hamcrest.Matchers.containsString("/routing/walk")))
            .andExpect(queryParam("route_mode", mode)).andExpect(queryParam("start_x", "126.832"))
            .andRespond(withSuccess(result, MediaType.APPLICATION_JSON));
    }
    private WalkingRouteResultDTO search() { return service.searchFastestWalkingRoute("126.832","37.551","126.83","37.57","학교"); }
    @Test void selectsLowerTimeAcrossBothWalkingOptionsWithoutTransitQuery() {
        var server=server(); expect(server,"BROAD_FIRST",route(200,400,"큰길")); expect(server,"SHORTEST",route(100,300,"최단"));
        var result=search();assertEquals(100,result.getTotalTime());assertEquals("최단",result.getSteps().get(0).getGuidance());server.verify();
    }
    @Test void doesNotAssumeShortestDistanceIsFastest() {
        var server=server();expect(server,"BROAD_FIRST",route(80,400,"큰길"));expect(server,"SHORTEST",route(100,300,"최단"));
        assertEquals(80,search().getTotalTime());server.verify();
    }
    @Test void breaksEqualTimeByDistance() {
        var server=server();expect(server,"BROAD_FIRST",route(100,400,"큰길"));expect(server,"SHORTEST",route(100,300,"최단"));
        assertEquals(300,search().getTotalDistance());server.verify();
    }
    @Test void oneProviderFailureDoesNotDiscardTheOtherOption() {
        var server=server();expect(server,"BROAD_FIRST",route(100,400,"큰길"));
        server.expect(requestTo(org.hamcrest.Matchers.containsString("/routing/walk"))).andExpect(queryParam("route_mode","SHORTEST"))
            .andRespond(withStatus(HttpStatus.SERVICE_UNAVAILABLE));
        assertEquals(100,search().getTotalTime());server.verify();
    }
    @Test void emptyAndUnmeasuredPathsAreNeverSelected() {
        var server=server();expect(server,"BROAD_FIRST",route(0,400,"측정 불가"));
        expect(server,"SHORTEST","{\"status\":\"OK\",\"route\":{\"properties\":{\"totalTime\":20},\"legs\":[]}}");
        assertFalse(search().isAvailable());server.verify();
    }
    @Test void endpointChecksAuthenticatedRoleAndCoordinatesBeforeCallingProvider() {
        var maps=mock(IKakaoMapService.class);var ai=mock(IEasyGuideService.class);
        var controller=new MapController(maps,ai,mock(PlaceSearchService.class));var session=new MockHttpSession();
        assertEquals(false,controller.walkingReroute("126.832","37.551","126.83","37.57","학교",session).get("success"));
        session.setAttribute("SS_USER_ID",7L);session.setAttribute("SS_USER_ROLE","GUARDIAN");
        assertEquals(false,controller.walkingReroute("126.832","37.551","126.83","37.57","학교",session).get("success"));
        session.setAttribute("SS_USER_ROLE","USER");
        assertEquals(false,controller.walkingReroute("NaN","37.551","126.83","37.57","학교",session).get("success"));
        verifyNoInteractions(maps,ai);
    }
    @Test void endpointPreservesAiProcessingAndReturnsOnlyWalking() {
        var maps=mock(IKakaoMapService.class);var ai=mock(IEasyGuideService.class);
        var controller=new MapController(maps,ai,mock(PlaceSearchService.class));var session=new MockHttpSession();
        session.setAttribute("SS_USER_ID",7L);session.setAttribute("SS_USER_ROLE","USER");
        var route=new WalkingRouteResultDTO();route.setAvailable(true);route.setTotalTime(100);
        when(maps.searchFastestWalkingRoute("126.832","37.551","126.83","37.57","학교")).thenReturn(route);
        var result=controller.walkingReroute("126.832","37.551","126.83","37.57","학교",session);
        assertEquals(true,result.get("success"));assertSame(route,result.get("walking"));assertFalse(result.containsKey("publicTransit"));
        verify(ai).applyEasyGuidance(argThat(value->value.getWalking()==route));
        verify(maps,never()).searchRoutes(any(),any(),any(),any(),any());
    }
}
