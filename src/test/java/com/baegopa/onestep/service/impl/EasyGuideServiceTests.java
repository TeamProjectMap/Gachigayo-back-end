package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.*;
import com.baegopa.onestep.mapper.IEasyGuideMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class EasyGuideServiceTests {
    private void allowed(String original, String easy) {
        assertTrue(EasyGuideService.isSafe(original, easy), original + " => " + easy);
    }
    private void rejected(String original, String easy) {
        assertFalse(EasyGuideService.isSafe(original, easy), original + " => " + easy);
    }
    @Test void acceptsApprovedPlainLanguageRewrites() {
        allowed("5호선 (우장산 > 발산)", "우장산에서 5호선을 타요. 발산에서 내려요.");
        allowed("간선 652 (우장산역1번출구 > 발산역.우장산힐스테이트)",
                "우장산역1번출구에서 652번 버스를 타요. 발산역.우장산힐스테이트에서 내려요.");
        allowed("장계농협 농축산물직판장까지 707m 이동(강서로)",
                "강서로를 따라 장계농협 농축산물직판장까지 707m 걸어가요.");
        allowed("발산역사거리 앞에서 횡단보도 이용", "발산역사거리 앞에서 횡단보도를 건너요.");
        allowed("100m 직진 후 좌회전", "100m 앞으로 가요. 왼쪽으로 도세요.");
    }
    @Test void rejectsChangedMissingAddedOrReorderedDirections() {
        rejected("100m 직진 후 좌회전", "100m 직진 후 우회전해요.");
        rejected("100m 직진 후 좌회전", "100m 좌회전 후 직진해요.");
        rejected("100m 직진 후 좌회전", "100m 직진해요.");
        rejected("100m 이동", "100m 앞으로 가요.");
    }
    @Test void comparesWholeNumbersCountsAndUnits() {
        rejected("5호선 이용", "15호선을 타요.");
        rejected("100m 이동", "1000m 걸어가요.");
        rejected("100m 이동", "100km 걸어가요.");
        rejected("100m 직진 후 50m 좌회전", "50m 직진 후 100m 좌회전해요.");
        rejected("5호선 (발산 > 우장산)", "발산에서 5호선을 타요. 우장산에서 5호선을 내려요.");
    }
    @Test void preservesArbitraryPlaceNamesRoadsAndTheirOrder() {
        rejected("송정반점 까치산점까지 100m 이동", "송정반점 마곡점까지 100m 걸어가요.");
        rejected("CU 편의점까지 100m 이동", "편의점 CU까지 100m 걸어가요.");
        rejected("100m 직진", "100m 직진해요. 편의점에서 기다려요.");
        rejected("학교까지 100m 이동(강서로)", "강서로를 따라 병원까지 100m 걸어가요.");
        rejected("학교까지 100m 이동(강서로)", "강남로를 따라 학교까지 100m 걸어가요.");
        rejected("학교까지 100m 이동", "학교에서 100m 걸어가요.");
        rejected("이동갈비까지 100m 이동", "갈비까지 100m 걸어가요.");
    }
    @Test void preservesLineAndBoardingAlightingRoles() {
        rejected("5호선 (우장산 > 발산)", "발산에서 5호선을 타요. 우장산에서 내려요.");
        rejected("5호선 (우장산 > 발산)", "우장산에서 5호선을 내려요. 발산에서 타요.");
        rejected("5호선 (우장산 > 발산)", "우장산에서 5번 버스를 타요. 발산에서 내려요.");
        rejected("5호선 (우장산 > 발산)", "우장산에서 5호선을 타요.");
        rejected("100m 직진", "지하철 100m 직진해요.");
        rejected("100m 이동", "100m 타요.");
    }
    @Test void rejectsBlankAndUnexpectedInstructionWords() {
        rejected("100m 이동", "");
        rejected("100m 이동", null);
        rejected("100m 이동", "100m 뛰어가요.");
        rejected("100m 직진", "100m 직진하지 마세요.");
    }
    private IEasyGuideMapper mapper() {
        var mapper = mock(IEasyGuideMapper.class);
        when(mapper.getEasyTexts(anyList())).thenReturn(List.of());
        return mapper;
    }
    private EasyGuideService service(IEasyGuideMapper mapper) {
        var service = new EasyGuideService(mapper);
        ReflectionTestUtils.setField(service, "enabled", true);
        ReflectionTestUtils.setField(service, "apiKey", "");
        return service;
    }
    private KakaoRouteSearchResultDTO route(String text) {
        var step = new WalkingStepDTO(); step.setGuidance(text);
        var walking = new WalkingRouteResultDTO(); walking.setSteps(List.of(step));
        var result = new KakaoRouteSearchResultDTO(); result.setWalking(walking); return result;
    }
    private String easy(KakaoRouteSearchResultDTO route) { return route.getWalking().getSteps().get(0).getEasyGuidance(); }
    private EasyGuideTextDTO cached(String original, String easy) throws Exception {
        var row = new EasyGuideTextDTO();
        row.setOriginalHash(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(("v3|" + original).getBytes(StandardCharsets.UTF_8))));
        row.setEasyText(easy); return row;
    }
    @Test void noKeyKeepsOriginalGuidance() {
        var mapper = mapper(); var routes = route("100m 직진"); service(mapper).applyEasyGuidance(routes);
        assertNull(easy(routes)); assertEquals("100m 직진", routes.getWalking().getSteps().get(0).getGuidance());
        verify(mapper, never()).insertEasyText(any());
    }
    @Test void revalidatesCachedTextBeforeUsingIt() throws Exception {
        var mapper = mapper(); var service = service(mapper);
        when(mapper.getEasyTexts(anyList())).thenReturn(List.of(cached("100m 직진 후 좌회전", "100m 직진 후 우회전해요.")));
        var routes = route("100m 직진 후 좌회전"); service.applyEasyGuidance(routes); assertNull(easy(routes));
        when(mapper.getEasyTexts(anyList())).thenReturn(List.of(cached("100m 직진 후 좌회전", "100m 앞으로 가요. 왼쪽으로 도세요.")));
        routes = route("100m 직진 후 좌회전"); service.applyEasyGuidance(routes);
        assertEquals("100m 앞으로 가요. 왼쪽으로 도세요.", easy(routes));
    }
    @Test void invalidAiResponseIsNotAppliedOrCached() {
        var mapper = mapper(); var service = service(mapper);
        var builder = RestClient.builder(); var server = MockRestServiceServer.bindTo(builder).build();
        ReflectionTestUtils.setField(service, "restClient", builder.build());
        ReflectionTestUtils.setField(service, "apiKey", "test-key");
        ReflectionTestUtils.setField(service, "model", "test-model");
        ReflectionTestUtils.setField(service, "url", "https://example.test/convert");
        server.expect(requestTo("https://example.test/convert")).andRespond(withSuccess(
                "{\"output_text\":\"{\\\"items\\\":[\\\"100m 직진 후 우회전해요.\\\"]}\"}", MediaType.APPLICATION_JSON));
        var routes = route("100m 직진 후 좌회전"); service.applyEasyGuidance(routes);
        assertNull(easy(routes)); verify(mapper, never()).insertEasyText(any()); server.verify();
    }
    @Test void validAiResponseIsAppliedAndCachedUsingNewValidationVersion() {
        var mapper = mapper(); var service = service(mapper);
        var builder = RestClient.builder(); var server = MockRestServiceServer.bindTo(builder).build();
        ReflectionTestUtils.setField(service, "restClient", builder.build());
        ReflectionTestUtils.setField(service, "apiKey", "test-key");
        ReflectionTestUtils.setField(service, "model", "test-model");
        ReflectionTestUtils.setField(service, "url", "https://example.test/convert");
        server.expect(requestTo("https://example.test/convert")).andRespond(withSuccess(
                "{\"output_text\":\"{\\\"items\\\":[\\\"100m 앞으로 가요.\\\"]}\"}", MediaType.APPLICATION_JSON));
        var routes = route("100m 직진"); service.applyEasyGuidance(routes);
        assertEquals("100m 앞으로 가요.", easy(routes));
        verify(mapper).insertEasyText(argThat(row -> "test-model v3".equals(row.getModel())
                && "100m 앞으로 가요.".equals(row.getEasyText())));
        server.verify();
    }
}
