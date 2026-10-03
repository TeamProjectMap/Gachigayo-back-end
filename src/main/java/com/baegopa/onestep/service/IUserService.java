package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.UserDTO;

import java.util.Map;

public interface IUserService {

    boolean isLoginIdDuplicated(String loginId);

    boolean isEmailDuplicated(String email);

    boolean isValidLinkCode(String linkCode);

    /**
     * 지금 이 연결코드로 연결할 수 있는지 확인
     */
    void validateLinkCode(String linkCode);

    /**
     * 연결코드 다시 받기 (이용자 전용)
     *
     * @return 새로 만들어진 연결코드
     */
    String reissueLinkCode(Long userId);

    UserDTO login(UserDTO userDTO);

    Map<String, Object> getHomeInfo(Long userId, String userRole);

    String getHelpRequestMessage(Long userId);

    int saveHelpRequestMessage(Long userId, String helpRequestMessage);

    int registerUser(UserDTO userDTO);

    int registerGuardian(UserDTO userDTO, String linkCode);

    UserDTO searchUserIdOrPassword(UserDTO userDTO);

    int newPassword(UserDTO userDTO);
}
