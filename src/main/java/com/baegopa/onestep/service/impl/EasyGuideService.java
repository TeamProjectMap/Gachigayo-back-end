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
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
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

    /**
     * 프롬프트를 바꾸면 이 값을 올린다. 저장된 문장은 이 값과 원문을 합쳐 찾으므로,
     * 예전 프롬프트로 만든 문장은 더 이상 쓰이지 않고 새로 만든다.
     */
    private static final String PROMPT_VERSION = "v3";

    private static final String SYSTEM_INSTRUCTION = String.join("\n",
            "너는 발달장애인을 위한 길안내 문구를 쉬운 말로 바꾸는 도우미야.",
            "규칙:",
            "- 짧은 문장으로 쓴다. 한 문장에는 행동 하나만 쓴다. 최대 두 문장.",
            "- '~해요' 말투로, 맞춤법에 맞게 쓴다.",
            "- 어려운 말은 쉬운 말로 바꾼다. 예: 승차 → 타요, 하차 → 내려요, 환승 → 갈아타요, 방면 → 쪽, 이동 → 걸어가요.",
            "- 역 이름, 정류장 이름, 건물 이름, 길 이름, 버스 번호, 호선, 출구 번호, 거리(m), 왼쪽/오른쪽은 원문 그대로 쓴다. 빼거나 바꾸지 않는다.",
            "- '간선', '지선' 같은 버스 종류 말은 빼도 된다.",
            "- 원문에 없는 내용은 절대 더하지 않는다.",
            "원문 형식 안내:",
            "- '노선 (A > B)'는 A에서 그 노선을 타고 B에서 내린다는 뜻이다.",
            "- '…까지 707m 이동(강서로)'는 강서로를 따라 …까지 707m 걸어간다는 뜻이다.",
            "예시:",
            "- '5호선 (우장산 > 발산)' → '우장산에서 5호선을 타요. 발산에서 내려요.'",
            "- '간선 652 (우장산역1번출구 > 발산역.우장산힐스테이트)' → '우장산역1번출구에서 652번 버스를 타요. 발산역.우장산힐스테이트에서 내려요.'",
            "- '장계농협 농축산물직판장까지 707m 이동(강서로)' → '강서로를 따라 장계농협 농축산물직판장까지 707m 걸어가요.'",
            "- '발산역사거리 앞에서 횡단보도 이용' → '발산역사거리 앞에서 횡단보도를 건너요.'",
            "입력은 번호가 붙은 안내 문구 목록이다.",
            "같은 순서, 같은 개수로 바꾼 문장을 items 배열에 담은 JSON 하나로만 답한다.");

    /** 카카오 버스 안내 '652외 8대'의 '외 8대'(같은 길로 가는 다른 버스 수)는 이용자에게 필요 없다 */
    private static final Pattern OTHER_BUSES = Pattern.compile("\\s*외\\s*\\d+\\s*대");

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
        originals.forEach(original -> hashToOriginal.put(cacheKey(original), original));

        Map<String, String> saved = new HashMap<>();
        try {
            for (EasyGuideTextDTO row : easyGuideMapper.getEasyTexts(new ArrayList<>(hashToOriginal.keySet()))) {
                String original = hashToOriginal.get(row.getOriginalHash());
                if (original != null && isSafe(forAi(original), row.getEasyText())) {
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
                row.setOriginalHash(cacheKey(original));
                row.setOriginalText(original);
                row.setEasyText(easy);
                row.setModel(model + " " + PROMPT_VERSION);
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
            input.append(i + 1).append(". ").append(forAi(originals.get(i))).append('\n');
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
            if (isSafe(forAi(original), easy)) {
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

    /** AI에 보낼 문장: 이용자에게 필요 없는 '외 N대'를 뺀다 */
    static String forAi(String original) {
        return OTHER_BUSES.matcher(original).replaceAll("");
    }

    /**
     * 쉬운 문장이 원문의 사실을 지켰는지 검사한다.
     * 방향·숫자·장소명·출발/도착 역할을 보존하지 못하면 원문으로 안내한다.
     */
    static boolean isSafe(String original, String easy) {
        return EasyGuideValidator.isSafe(original, easy);
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

    /** 저장소에서 찾을 키: 프롬프트 버전 + 원문 */
    private static String cacheKey(String original) {
        return sha256(PROMPT_VERSION + "|" + original);
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
