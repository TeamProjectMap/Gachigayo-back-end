package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.EasyGuideTextDTO;
import com.baegopa.onestep.dto.KakaoRouteSearchResultDTO;
import com.baegopa.onestep.dto.PublicTransitRouteDTO;
import com.baegopa.onestep.dto.PublicTransitStepDTO;
import com.baegopa.onestep.dto.WalkingStepDTO;
import com.baegopa.onestep.mapper.IEasyGuideMapper;
import com.baegopa.onestep.service.IEasyGuideService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 길안내 문구를 Gemini로 쉬운 말로 바꾼다.
 * <p>
 * 흐름: 문구 모으기 → DB에 저장된 것 먼저 쓰기 → 처음 보는 문장만 Gemini에 한 번에 보내기
 * → 역 이름·숫자가 그대로인지 검사 → 통과한 것만 저장하고 화면에 보낸다.
 * 무엇이 실패하든 원래 문구로 안내되도록 예외를 밖으로 던지지 않는다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class EasyGuideService implements IEasyGuideService {

    /** 한 번에 AI에 보내는 최대 문장 수. 넘는 것은 원래 문구로 둔다 */
    private static final int MAX_TEXTS_PER_REQUEST = 40;

    private static final String SYSTEM_INSTRUCTION = String.join("\n",
            "너는 발달장애인을 위한 길안내 문구를 쉬운 말로 바꾸는 도우미야.",
            "규칙:",
            "- 짧은 문장으로 쓴다. 한 문장에는 행동 하나만 쓴다. 최대 두 문장.",
            "- '~해요' 말투로 쓴다.",
            "- 어려운 말은 쉬운 말로 바꾼다. 예: 승차 → 타요, 하차 → 내려요, 환승 → 갈아타요, 방면 → 쪽, 직진 → 앞으로 쭉 가요.",
            "- 역 이름, 정류장 이름, 건물 이름, 버스 번호, 호선, 출구 번호, 숫자, 왼쪽/오른쪽 방향은 원문 그대로 쓴다. 빼거나 바꾸지 않는다.",
            "- 원문에 없는 내용은 절대 더하지 않는다.",
            "입력은 번호가 붙은 안내 문구 목록이다.",
            "같은 순서, 같은 개수로 바꾼 문장을 items 배열에 담은 JSON 하나로만 답한다.");

    /** 원문에 있으면 바꾼 문장에도 꼭 있어야 하는 것: 숫자, '○○역' */
    private static final Pattern NUMBER = Pattern.compile("\\d+");
    private static final Pattern STATION = Pattern.compile("[가-힣A-Za-z0-9]+역");

    private final IEasyGuideMapper easyGuideMapper;
    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    @Value("${gemini.api-key:${GEMINI_API_KEY:}}")
    private String apiKey;

    @Value("${gemini.model:gemini-3.5-flash-lite}")
    private String model;

    @Value("${gemini.url:https://generativelanguage.googleapis.com/v1beta/interactions}")
    private String url;

    /** Interactions API 버전 헤더. 비우면 보내지 않는다 */
    @Value("${gemini.api-revision:2026-05-20}")
    private String apiRevision;

    /** AI가 이보다 늦으면 기다리지 않고 원래 문구로 안내한다 */
    @Value("${gemini.timeout-seconds:6}")
    private int timeoutSeconds;

    @Value("${gemini.enabled:true}")
    private boolean enabled;

    private volatile RestClient restClient;

    @Override
    public void applyEasyGuidance(KakaoRouteSearchResultDTO routes) {
        if (routes == null) {
            return;
        }

        try {
            // 1. 화면에 나갈 안내 문구를 모은다 (같은 문장은 한 번만)
            Map<String, List<Consumer<String>>> targets = collectTargets(routes);
            if (targets.isEmpty()) {
                return;
            }

            // 2. 전에 바꿔 둔 문장은 DB에서 바로 쓴다
            Map<String, String> easyTexts = new HashMap<>(loadSaved(targets.keySet()));

            // 3. 처음 보는 문장만 AI에 보낸다
            List<String> misses = targets.keySet().stream()
                    .filter(text -> !easyTexts.containsKey(text))
                    .limit(MAX_TEXTS_PER_REQUEST)
                    .toList();

            if (!misses.isEmpty() && isReady()) {
                Map<String, String> converted = convertWithGemini(misses);
                easyTexts.putAll(converted);
                save(converted);
            }

            // 4. 단계마다 쉬운 문장을 채운다 (없는 단계는 원래 문구로 안내된다)
            targets.forEach((original, setters) -> {
                String easy = easyTexts.get(original);
                if (easy != null) {
                    setters.forEach(setter -> setter.accept(easy));
                }
            });
        } catch (Exception e) {
            log.warn("Easy guidance failed. Original guidance is used.", e);
        }
    }

    private boolean isReady() {
        if (!enabled) {
            return false;
        }
        if (apiKey == null || apiKey.isBlank()) {
            log.debug("GEMINI_API_KEY is not set. Easy guidance is skipped.");
            return false;
        }
        return true;
    }

    private Map<String, List<Consumer<String>>> collectTargets(KakaoRouteSearchResultDTO routes) {
        Map<String, List<Consumer<String>>> targets = new LinkedHashMap<>();

        if (routes.getPublicTransit() != null && routes.getPublicTransit().getRoutes() != null) {
            for (PublicTransitRouteDTO route : routes.getPublicTransit().getRoutes()) {
                if (route.getSteps() == null) {
                    continue;
                }
                for (PublicTransitStepDTO step : route.getSteps()) {
                    addTarget(targets, step.getGuidance(), step::setEasyGuidance);
                }
            }
        }

        if (routes.getWalking() != null && routes.getWalking().getSteps() != null) {
            for (WalkingStepDTO step : routes.getWalking().getSteps()) {
                addTarget(targets, step.getGuidance(), step::setEasyGuidance);
            }
        }

        return targets;
    }

    private void addTarget(Map<String, List<Consumer<String>>> targets, String guidance, Consumer<String> setter) {
        if (guidance == null || guidance.isBlank()) {
            return;
        }
        targets.computeIfAbsent(guidance.trim(), key -> new ArrayList<>()).add(setter);
    }

    /* ---------------------------- DB 저장소 ---------------------------- */

    private Map<String, String> loadSaved(Set<String> originals) {
        Map<String, String> hashToOriginal = new HashMap<>();
        originals.forEach(original -> hashToOriginal.put(sha256(original), original));

        Map<String, String> saved = new HashMap<>();
        try {
            for (EasyGuideTextDTO row : easyGuideMapper.getEasyTexts(new ArrayList<>(hashToOriginal.keySet()))) {
                String original = hashToOriginal.get(row.getOriginalHash());
                if (original != null && row.getEasyText() != null) {
                    saved.put(original, row.getEasyText());
                }
            }
        } catch (Exception e) {
            // 테이블이 아직 없거나 DB 오류여도 길안내는 계속된다
            log.warn("Easy guidance cache lookup failed: {}", e.getMessage());
        }
        return saved;
    }

    private void save(Map<String, String> converted) {
        converted.forEach((original, easy) -> {
            try {
                EasyGuideTextDTO row = new EasyGuideTextDTO();
                row.setOriginalHash(sha256(original));
                row.setOriginalText(original);
                row.setEasyText(easy);
                row.setModel(model);
                easyGuideMapper.insertEasyText(row);
            } catch (Exception e) {
                log.warn("Easy guidance cache save failed: {}", e.getMessage());
            }
        });
    }

    /* ---------------------------- Gemini ---------------------------- */

    /** 바꾼 문장 중 검사를 통과한 것만 돌려준다 */
    private Map<String, String> convertWithGemini(List<String> originals) {
        Map<String, String> result = new LinkedHashMap<>();

        StringBuilder input = new StringBuilder();
        for (int i = 0; i < originals.size(); i++) {
            input.append(i + 1).append(". ").append(originals.get(i)).append('\n');
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("system_instruction", SYSTEM_INSTRUCTION);
        body.put("input", input.toString());
        body.put("store", false);
        body.put("generation_config", Map.of(
                "thinking_level", "minimal",
                "max_output_tokens", 4000));
        body.put("response_format", Map.of(
                "type", "text",
                "mime_type", "application/json",
                "schema", Map.of(
                        "type", "object",
                        "properties", Map.of(
                                "items", Map.of(
                                        "type", "array",
                                        "items", Map.of("type", "string"))),
                        "required", List.of("items"))));

        long started = System.currentTimeMillis();
        JsonNode response;
        try {
            RestClient.RequestBodySpec request = client()
                    .post()
                    .uri(url)
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("x-goog-api-key", apiKey);
            if (apiRevision != null && !apiRevision.isBlank()) {
                request = request.header("Api-Revision", apiRevision);
            }
            response = request.body(body).retrieve().body(JsonNode.class);
        } catch (Exception e) {
            log.warn("Gemini easy guidance request failed ({} ms): {}",
                    System.currentTimeMillis() - started, e.getMessage());
            return result;
        }

        List<String> items = readItems(response);
        if (items.size() != originals.size()) {
            log.warn("Gemini returned {} items for {} texts. Ignored.", items.size(), originals.size());
            return result;
        }

        for (int i = 0; i < originals.size(); i++) {
            String original = originals.get(i);
            String easy = items.get(i) == null ? "" : items.get(i).trim();
            if (isSafe(original, easy)) {
                result.put(original, easy);
            } else {
                log.info("Easy guidance rejected. original='{}', easy='{}'", original, easy);
            }
        }

        log.info("Gemini easy guidance: {}/{} accepted in {} ms",
                result.size(), originals.size(), System.currentTimeMillis() - started);
        return result;
    }

    /** 응답의 마지막 model_output 텍스트(JSON)에서 items 배열을 꺼낸다 */
    private List<String> readItems(JsonNode response) {
        List<String> items = new ArrayList<>();
        if (response == null) {
            return items;
        }

        String text = null;
        JsonNode steps = response.get("steps");
        if (steps != null && steps.isArray()) {
            for (JsonNode step : steps) {
                if (!"model_output".equals(string(step.get("type")))) {
                    continue;
                }
                JsonNode content = step.get("content");
                if (content == null || !content.isArray()) {
                    continue;
                }
                for (JsonNode block : content) {
                    if ("text".equals(string(block.get("type"))) && block.get("text") != null) {
                        text = string(block.get("text"));
                    }
                }
            }
        }
        if (text == null) {
            text = string(response.get("output_text"));
        }
        if (text == null || text.isBlank()) {
            log.warn("Gemini easy guidance: no text in response (status={})", string(response.get("status")));
            return items;
        }

        try {
            JsonNode parsed = jsonMapper.readTree(text);
            JsonNode array = parsed.isArray() ? parsed : parsed.get("items");
            if (array != null && array.isArray()) {
                array.forEach(node -> items.add(node.isNull() ? null : node.asString()));
            }
        } catch (Exception e) {
            log.warn("Gemini easy guidance: response is not valid JSON: {}", e.getMessage());
        }
        return items;
    }

    /**
     * 쉬운 문장이 원문의 사실을 지켰는지 검사한다.
     * 숫자(버스 번호·호선·출구·거리)와 '○○역'은 그대로 들어 있어야 한다.
     */
    static boolean isSafe(String original, String easy) {
        if (easy == null || easy.isBlank()) {
            return false;
        }
        if (easy.length() > Math.max(80, original.length() * 3)) {
            return false;
        }
        for (String token : tokens(NUMBER, original)) {
            if (!easy.contains(token)) {
                return false;
            }
        }
        for (String token : tokens(STATION, original)) {
            if (!easy.contains(token)) {
                return false;
            }
        }
        return true;
    }

    private static Set<String> tokens(Pattern pattern, String text) {
        Set<String> tokens = new LinkedHashSet<>();
        Matcher matcher = pattern.matcher(text);
        while (matcher.find()) {
            tokens.add(matcher.group());
        }
        return tokens;
    }

    private RestClient client() {
        if (restClient == null) {
            synchronized (this) {
                if (restClient == null) {
                    JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                            .connectTimeout(Duration.ofSeconds(3)).build());
                    factory.setReadTimeout(Duration.ofSeconds(Math.max(1, timeoutSeconds)));
                    restClient = RestClient.builder().requestFactory(factory).build();
                }
            }
        }
        return restClient;
    }

    private static String string(JsonNode node) {
        return node == null || node.isNull() ? null : node.asString();
    }

    private static String sha256(String text) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
