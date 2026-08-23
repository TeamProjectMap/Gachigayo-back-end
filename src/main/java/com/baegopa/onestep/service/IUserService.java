package com.baegopa.onestep.service;

import com.baegopa.onestep.dto.UserDTO;

import java.util.Map;

public interface IUserService {

    boolean isLoginIdDuplicated(String loginId);

    boolean isEmailDuplicated(String email);

    boolean isValidLinkCode(String linkCode);

    UserDTO login(UserDTO userDTO);

    Map<String, Object> getHomeInfo(Long userId, String userRole);

    int registerUser(UserDTO userDTO);

    int registerGuardian(UserDTO userDTO, String linkCode);

    UserDTO searchUserIdOrPassword(UserDTO userDTO);

    int newPassword(UserDTO userDTO);
}
