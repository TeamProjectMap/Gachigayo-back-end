package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.TripEventDTO;
import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.dto.UserSettingsDTO;
import com.baegopa.onestep.mapper.IEventMapper;
import com.baegopa.onestep.mapper.ILinkMapper;
import com.baegopa.onestep.mapper.ISettingsMapper;
import com.baegopa.onestep.service.IEventService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class EventService implements IEventService {

    private static final String EVENT_HELP_REQUEST = "HELP_REQUEST";

    /** 이용자가 직접 누른 것이면 N, 시스템이 자동으로 보낸 것이면 Y */
    private static final String SENT_BY_USER = "N";

    /**
     * 설정으로 끌 수 있는 알림.
     * 도움요청과 경로 이탈은 안전과 직결돼서 설정과 상관없이 항상 보낸다.
     */
    private static final List<String> OPTIONAL_ALARM_TYPES =
            Arrays.asList("DEPARTURE", "CHECKPOINT", "ARRIVED");

    /**
     * 알림 종류별 기본 문구. 이벤트에 적어 보낸 내용이 있으면 그것을 쓴다.
     * <p>
     * 알림 제목("도착했어요" 등)은 화면에서 종류를 보고 만든다.
     * 여기 담기는 건 제목 밑에 붙는 보충 설명이라, 제목과 겹치면 빈 값으로 둔다.
     * (예: 체크포인트 통과 -> "CU편의점 통과", 도착 -> "폴리텍 강서캠퍼스")
     */
    private static final Map<String, String> DEFAULT_CONTENTS = Map.of(
            "DEPARTURE", "",
            "CHECKPOINT", "",
            "DEVIATION", "경로를 벗어났습니다",
            "ARRIVED", "",
            EVENT_HELP_REQUEST, "");

    private final IEventMapper eventMapper;
    private final ILinkMapper linkMapper;
    private final ISettingsMapper settingsMapper;

    @Override
    @Transactional
    public Map<String, Object> createHelpRequest(Long userId, String latitude, String longitude, String message) {
        TripEventDTO tripEventDTO = new TripEventDTO();
        tripEventDTO.setUserId(userId);
        tripEventDTO.setEventType(EVENT_HELP_REQUEST);
        tripEventDTO.setEventMessage(isBlank(message) ? null : message.trim());
        tripEventDTO.setLat(toCoordinate(latitude, "위도"));
        tripEventDTO.setLng(toCoordinate(longitude, "경도"));
        tripEventDTO.setAutoSentYn(SENT_BY_USER);

        // 이동 중이면 그 이동에 묶어둔다. 이동 중이 아니어도 도움요청은 보낼 수 있다.
        tripEventDTO.setTripId(eventMapper.getOngoingTripId(userId));

        boolean notified = createEvent(tripEventDTO);

        Map<String, Object> result = new HashMap<>();
        result.put("notified", notified);

        UserDTO guardian = linkMapper.getGuardianByUserId(userId);
        if (guardian != null) {
            result.put("guardianName", guardian.getUserName());
            result.put("guardianPhone", guardian.getPhone());
        }

        return result;
    }

    @Override
    @Transactional
    public boolean createEvent(TripEventDTO tripEventDTO) {
        eventMapper.insertTripEvent(tripEventDTO);

        log.info("이벤트 기록 userId={}, eventType={}, tripEventId={}",
                tripEventDTO.getUserId(), tripEventDTO.getEventType(), tripEventDTO.getTripEventId());

        UserDTO guardian = linkMapper.getGuardianByUserId(tripEventDTO.getUserId());

        // 연결된 보호자가 없으면 알릴 곳이 없다. 이벤트 기록은 그대로 남는다.
        if (guardian == null) {
            log.info("연결된 보호자가 없어 알림을 만들지 않음 userId={}", tripEventDTO.getUserId());
            return false;
        }

        if (!isAlarmOn(guardian.getUserId(), tripEventDTO.getEventType())) {
            log.info("보호자가 꺼둔 알림이라 만들지 않음 guardianId={}, eventType={}",
                    guardian.getUserId(), tripEventDTO.getEventType());
            return false;
        }

        eventMapper.insertNotification(
                guardian.getUserId(),
                tripEventDTO.getTripEventId(),
                tripEventDTO.getEventType(),
                toContent(tripEventDTO));

        return true;
    }

    /**
     * 보호자가 이 종류의 알림을 받기로 했는지 확인한다.
     * <p>
     * 설정을 한 번도 저장한 적이 없으면 받는 것으로 본다. (테이블 기본값과 같다)
     */
    private boolean isAlarmOn(Long guardianId, String eventType) {
        if (!OPTIONAL_ALARM_TYPES.contains(eventType)) {
            return true;
        }

        UserSettingsDTO settings = settingsMapper.getUserSettings(guardianId);

        return settings == null || "Y".equals(settings.getArrivalAlarmYn());
    }

    private String toContent(TripEventDTO tripEventDTO) {
        if (!isBlank(tripEventDTO.getEventMessage())) {
            return tripEventDTO.getEventMessage();
        }

        // NOTIFICATIONS.content 는 NOT NULL 이라 빈 문자열이라도 넣어야 한다
        return DEFAULT_CONTENTS.getOrDefault(tripEventDTO.getEventType(), "");
    }

    private BigDecimal toCoordinate(String value, String name) {
        if (isBlank(value)) {
            throw new IllegalArgumentException("현재 위치를 확인할 수 없습니다.");
        }

        try {
            return new BigDecimal(value.trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(name + " 값이 올바르지 않습니다.");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
