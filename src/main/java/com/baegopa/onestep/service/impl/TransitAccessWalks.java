package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.*;
import java.util.*;
import java.util.concurrent.*;

/** Complete missing connections with real pedestrian routes, never straight-line navigation. */
final class TransitAccessWalks {
    record Point(double longitude, double latitude) {}
    record Gap(Point from, Point to) {}
    record Part(PublicTransitStepDTO existing, Gap gap) {}
    record Plan(PublicTransitRouteDTO route, List<Part> parts) {}
    interface Finder { WalkingRouteResultDTO find(Point from, Point to, String destination); }
    private static final double JOIN_METRES = 20;
    private static final double SNAP_METRES = 60;

    static void complete(PublicTransitRouteResultDTO result, Point origin, Point destination,
                         String destinationName, Finder finder, Executor executor) {
        if (result == null || !result.isAvailable()) return;
        Map<Gap, CompletableFuture<List<PublicTransitStepDTO>>> requests = new LinkedHashMap<>();
        List<Plan> plans = new ArrayList<>();
        for (var route : result.getRoutes()) {
            var parts = new ArrayList<Part>();
            Point cursor = origin;
            boolean valid = route.getSteps() != null && !route.getSteps().isEmpty();
            if (!valid) continue;
            for (int i = 0; i < route.getSteps().size(); i++) {
                var step = route.getSteps().get(i);
                Point first = first(step), last = last(step);
                if (first == null || last == null) {
                    // Some providers include a walking placeholder but omit its geometry.
                    if (!"WALKING".equals(step.getType())) { valid = false; break; }
                    Point next = destination;
                    String label = destinationName;
                    for (int j = i + 1; j < route.getSteps().size(); j++) {
                        if (first(route.getSteps().get(j)) != null) {
                            next = first(route.getSteps().get(j)); label = boardingName(route.getSteps().get(j)); break;
                        }
                    }
                    addGap(parts, requests, cursor, next, label, finder, executor);
                    cursor = next;
                    continue;
                }
                addGap(parts, requests, cursor, first, boardingName(step), finder, executor);
                parts.add(new Part(step, null));
                cursor = last;
            }
            if (valid) {
                addGap(parts, requests, cursor, destination, destinationName, finder, executor);
                plans.add(new Plan(route, parts));
            }
        }
        CompletableFuture.allOf(requests.values().toArray(CompletableFuture[]::new)).join();
        var completed = new ArrayList<PublicTransitRouteDTO>();
        for (var plan : plans) {
            var steps = new ArrayList<PublicTransitStepDTO>();
            boolean valid = true;
            for (var part : plan.parts()) {
                if (part.existing() != null) steps.add(part.existing());
                else {
                    var walking = requests.get(part.gap()).join();
                    if (walking == null) { valid = false; break; }
                    steps.addAll(walking);
                }
            }
            if (!valid || steps.isEmpty()) continue;
            plan.route().setSteps(steps);
            plan.route().setTotalTime(Math.max(number(plan.route().getTotalTime()), steps.stream().mapToInt(s -> number(s.getTime())).sum()));
            plan.route().setTotalDistance(Math.max(number(plan.route().getTotalDistance()), steps.stream().mapToInt(s -> number(s.getDistance())).sum()));
            completed.add(plan.route());
        }
        result.setRoutes(completed);
        if (completed.isEmpty()) {
            result.setAvailable(false);
            result.setStatus("WALK_CONNECTION_UNAVAILABLE");
            result.setMessage("역·정류장까지 연결되는 도보 경로를 확인하지 못했습니다. 출발지를 확인하고 다시 검색해주세요.");
        }
    }

    private static void addGap(List<Part> parts, Map<Gap, CompletableFuture<List<PublicTransitStepDTO>>> requests,
                               Point from, Point to, String label, Finder finder, Executor executor) {
        if (distance(from, to) <= JOIN_METRES) return;
        Gap gap = new Gap(from, to);
        requests.computeIfAbsent(gap, key -> CompletableFuture.supplyAsync(() -> {
            try { return convert(finder.find(from, to, label), gap); }
            catch (Exception failure) { return null; }
        }, executor).completeOnTimeout(null, 8, TimeUnit.SECONDS));
        parts.add(new Part(null, gap));
    }

    private static List<PublicTransitStepDTO> convert(WalkingRouteResultDTO route, Gap gap) {
        if (route == null || !route.isAvailable() || route.getSteps() == null || route.getSteps().isEmpty()) return null;
        var steps = new ArrayList<PublicTransitStepDTO>();
        for (var walk : route.getSteps()) {
            var step = new PublicTransitStepDTO();
            step.setType("WALKING"); step.setGuidance(walk.getGuidance()); step.setEasyGuidance(walk.getEasyGuidance());
            step.setTime(walk.getTime()); step.setDistance(walk.getDistance());
            step.setLongitude(walk.getLongitude()); step.setLatitude(walk.getLatitude());
            for (var point : walk.getPathPoints()) {
                if (point(point.getLongitude(), point.getLatitude()) == null) continue;
                var converted = new PublicTransitStepDTO.PathPointDTO();
                converted.setLongitude(point.getLongitude()); converted.setLatitude(point.getLatitude());
                step.getPathPoints().add(converted);
            }
            steps.add(step);
        }
        Point start = steps.stream().map(TransitAccessWalks::first).filter(Objects::nonNull).findFirst().orElse(null);
        Point end = null;
        for (var step : steps) if (last(step) != null) end = last(step);
        if (start == null || end == null || distance(gap.from(), start) > SNAP_METRES || distance(gap.to(), end) > SNAP_METRES) return null;
        return steps;
    }

    private static String boardingName(PublicTransitStepDTO step) {
        if (step.getStops() == null || step.getStops().isEmpty()) return "연결 지점";
        String name = step.getStops().get(0);
        return "SUBWAY".equals(step.getType()) && !name.endsWith("역") ? name + "역" : name;
    }

    private static Point first(PublicTransitStepDTO step) {
        if (step.getPathPoints() != null) for (var p : step.getPathPoints()) {
            Point value = point(p.getLongitude(), p.getLatitude()); if (value != null) return value;
        }
        return point(step.getLongitude(), step.getLatitude());
    }
    private static Point last(PublicTransitStepDTO step) {
        if (step.getPathPoints() != null) for (int i = step.getPathPoints().size() - 1; i >= 0; i--) {
            var p = step.getPathPoints().get(i); Point value = point(p.getLongitude(), p.getLatitude()); if (value != null) return value;
        }
        return point(step.getLongitude(), step.getLatitude());
    }
    private static Point point(Double longitude, Double latitude) {
        return longitude == null || latitude == null || !Double.isFinite(longitude) || !Double.isFinite(latitude)
                || Math.abs(longitude) > 180 || Math.abs(latitude) > 90 ? null : new Point(longitude, latitude);
    }
    private static int number(Integer value) { return value == null ? 0 : Math.max(value, 0); }
    static double distance(Point a, Point b) {
        double lat = Math.toRadians(b.latitude() - a.latitude()), lon = Math.toRadians(b.longitude() - a.longitude());
        double h = Math.pow(Math.sin(lat / 2), 2) + Math.cos(Math.toRadians(a.latitude())) * Math.cos(Math.toRadians(b.latitude())) * Math.pow(Math.sin(lon / 2), 2);
        return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
    }
}
