package com.baegopa.onestep.util;

import com.baegopa.onestep.dto.RouteStepDTO;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 경로 구간 문구를 길찾기 앱처럼 깔끔하게 바꿔준다.
 * <p>
 * 저장된 구간 문구는 카카오 안내를 그대로 쓴 것이라
 * "김포공항김포공항역 환승", "5호선 (우장산 > 김포공항)" 처럼 이름이 겹치거나 기호가 많다.
 * 화면에는 "우장산역까지 도보", "5호선 / 우장산역 승차 → 김포공항역 하차" 처럼 보여준다.
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
            return stationName(walkTo, next != null && isSubway(next)) + "까지 도보";
        }

        if (mainText.endsWith("환승")) {
            String[] stops = transitStops(prev);
            return stops == null
                    ? "환승"
                    : stationName(stops[1], isSubway(prev)) + " 환승";
        }

        return mainText.isEmpty() ? "도보" : mainText;
    }

    /**
     * 버스·지하철 구간의 보충 설명. ("우장산역 승차 → 김포공항역 하차")
     * 타고 내리는 곳을 못 찾으면 저장된 문구를 그대로 쓴다.
     */
    public static String description(RouteStepDTO step) {
        String[] stops = transitStops(step);

        if (stops == null) {
            return trim(step.getMainText());
        }

        boolean subway = isSubway(step);
        return stationName(stops[0], subway) + " 승차 → " + stationName(stops[1], subway) + " 하차";
    }

    /** "A → B (도보)" 에서 B. 걷는 구간 문구가 아니면 null. */
    public static String walkDestination(String mainText) {
        Matcher matcher = WALK_PATTERN.matcher(trim(mainText));
        return matcher.find() ? matcher.group(2).trim() : null;
    }

    private static String transitTitle(RouteStepDTO step) {
        String lineName = trim(step.getLineName());

        if (lineName.isEmpty()) {
            return isSubway(step) ? "지하철" : "버스";
        }

        if ("BUS".equalsIgnoreCase(step.getStepType()) && !lineName.endsWith("번")) {
            return lineName + "번 버스";
        }

        return lineName;
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
