package com.baegopa.onestep.util;

import com.baegopa.onestep.dto.RouteStepDTO;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 경로 구간을 쉬운 말로 바꿔준다.
 * <p>
 * 저장된 구간 문구는 카카오 안내를 그대로 쓴 것이라
 * "한국폴리텍대학 서울강서캠퍼스 → 우장산 (도보)", "5호선 (우장산 > 김포공항)" 처럼 기호가 많다.
 * 이용 대상이 발달장애인이라 화면에는 "우장산역까지 걸어가기", "5호선 타기" 처럼 짧은 문장으로 보여준다.
 * 저장된 문구는 그대로 두고 보여줄 때만 바꾸므로 이미 만든 경로에도 적용된다.
 */
public class StepTextUtil {

    /** "출발지 → 도착지 (도보)" */
    private static final Pattern WALK_PATTERN = Pattern.compile("^(.+?)\\s*→\\s*(.+?)\\s*\\(도보\\)$");

    /** "5호선 (우장산 > 김포공항)" */
    private static final Pattern TRANSIT_PATTERN = Pattern.compile("\\((.+?)\\s*>\\s*(.+?)\\)\\s*$");

    private StepTextUtil() {
    }

    /**
     * 구간 제목
     *
     * @param prev 바로 앞 구간 (없으면 null). 갈아타는 곳 이름을 찾는 데 쓴다.
     * @param next 바로 뒤 구간 (없으면 null). 걸어갈 곳이 지하철역인지 보는 데 쓴다.
     */
    public static String title(RouteStepDTO step, RouteStepDTO prev, RouteStepDTO next) {
        String mainText = trim(step.getMainText());

        if (isTransit(step)) {
            return transitTitle(step);
        }

        String walkTo = walkDestination(mainText);
        if (walkTo != null) {
            // 타러 가는 곳이 지하철이면 "역"을 붙여야 알아듣기 쉽다
            return stationName(walkTo, next != null && isSubway(next)) + "까지 걸어가기";
        }

        if (mainText.endsWith("환승")) {
            String[] stops = transitStops(prev);
            return stops == null
                    ? "갈아타기"
                    : stationName(stops[1], isSubway(prev)) + "에서 갈아타기";
        }

        return mainText.isEmpty() ? "걸어서 이동하기" : mainText;
    }

    /**
     * 버스·지하철 구간의 보충 설명. ("우장산역에서 타고 김포공항역에서 내려요")
     * 타고 내리는 곳을 못 찾으면 저장된 문구를 그대로 쓴다.
     */
    public static String description(RouteStepDTO step) {
        String[] stops = transitStops(step);

        if (stops == null) {
            return trim(step.getMainText());
        }

        boolean subway = isSubway(step);
        return stationName(stops[0], subway) + "에서 타고 " + stationName(stops[1], subway) + "에서 내려요";
    }

    /** "A → B (도보)" 에서 B. 걷는 구간 문구가 아니면 null. */
    public static String walkDestination(String mainText) {
        Matcher matcher = WALK_PATTERN.matcher(trim(mainText));
        return matcher.find() ? matcher.group(2).trim() : null;
    }

    private static String transitTitle(RouteStepDTO step) {
        String lineName = trim(step.getLineName());

        if (lineName.isEmpty()) {
            return isSubway(step) ? "지하철 타기" : "버스 타기";
        }

        if ("BUS".equalsIgnoreCase(step.getStepType()) && !lineName.endsWith("번")) {
            return lineName + "번 버스 타기";
        }

        return lineName + " 타기";
    }

    /** 타는 곳, 내리는 곳. 버스·지하철 구간이 아니거나 문구에서 못 찾으면 null. */
    private static String[] transitStops(RouteStepDTO step) {
        if (step == null || !isTransit(step)) {
            return null;
        }

        Matcher matcher = TRANSIT_PATTERN.matcher(trim(step.getMainText()));
        if (!matcher.find()) {
            return null;
        }

        return new String[]{matcher.group(1).trim(), matcher.group(2).trim()};
    }

    /** 카카오는 지하철역을 "우장산" 처럼 주기 때문에 "역"을 붙인다 */
    private static String stationName(String name, boolean subway) {
        if (!subway || name.endsWith("역") || name.contains("역 ")) {
            return name;
        }
        return name + "역";
    }

    private static boolean isTransit(RouteStepDTO step) {
        return "BUS".equalsIgnoreCase(step.getStepType()) || isSubway(step);
    }

    private static boolean isSubway(RouteStepDTO step) {
        return "SUBWAY".equalsIgnoreCase(step.getStepType());
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
