package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.HelpRequestDTO;
import com.baegopa.onestep.dto.KakaoPlaceDTO;
import com.baegopa.onestep.dto.UserDTO;

public interface IHelpRequestService {

    HelpRequestDTO createHelpRequest(Long userId, HelpRequestDTO helpRequestDTO);

    UserDTO getGuardianContact(Long userId);

    KakaoPlaceDTO getNearbySafetyCenter(String longitude, String latitude);
}
