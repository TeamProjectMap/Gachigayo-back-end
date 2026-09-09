package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.HelpRequestDTO;
import com.baegopa.onestep.dto.KakaoPlaceDTO;
import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.mapper.IHelpRequestMapper;
import com.baegopa.onestep.service.IHelpRequestService;
import com.baegopa.onestep.service.IKakaoMapService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Slf4j
@Service
@RequiredArgsConstructor
public class HelpRequestService implements IHelpRequestService {

    private static final String STATUS_REQUESTED = "REQUESTED";

    private final IHelpRequestMapper helpRequestMapper;
    private final IKakaoMapService kakaoMapService;

    @Override
    @Transactional
    public HelpRequestDTO createHelpRequest(Long userId, HelpRequestDTO helpRequestDTO) {
        if (userId == null) {
            throw new IllegalArgumentException("로그인이 필요합니다.");
        }
        if (helpRequestDTO == null) {
            helpRequestDTO = new HelpRequestDTO();
        }

        if (!isBlank(helpRequestDTO.getClientRequestKey())) {
            HelpRequestDTO existingDTO = helpRequestMapper.getHelpRequestByClientRequestKey(helpRequestDTO.getClientRequestKey());
            if (existingDTO != null && userId.equals(existingDTO.getUserId())) {
                return existingDTO;
            }
        }

        UserDTO guardianDTO = getGuardianContact(userId);
        helpRequestDTO.setUserId(userId);
        helpRequestDTO.setGuardianId(guardianDTO == null ? null : guardianDTO.getUserId());
        helpRequestDTO.setStatus(STATUS_REQUESTED);

        helpRequestMapper.insertHelpRequest(helpRequestDTO);
        return helpRequestDTO;
    }

    @Override
    public UserDTO getGuardianContact(Long userId) {
        if (userId == null) {
            return null;
        }

        return helpRequestMapper.getGuardianByUserId(userId);
    }

    @Override
    public KakaoPlaceDTO getNearbySafetyCenter(String longitude, String latitude) {
        if (isBlank(longitude) || isBlank(latitude)) {
            throw new IllegalArgumentException("현재 위치가 필요합니다.");
        }

        return kakaoMapService.searchNearbySafetyCenter(longitude.trim(), latitude.trim());
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
