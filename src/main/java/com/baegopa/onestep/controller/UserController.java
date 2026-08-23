package com.baegopa.onestep.controller;

import com.baegopa.onestep.dto.MailDTO;
import com.baegopa.onestep.dto.UserDTO;
import com.baegopa.onestep.service.IMailService;
import com.baegopa.onestep.service.IUserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Slf4j
@Controller
@RequiredArgsConstructor
@RequestMapping("/user")
public class UserController {

    private static final String SESSION_EMAIL_AUTH_CODE = "emailAuthCode";
    private static final String SESSION_EMAIL_AUTH_EMAIL = "emailAuthEmail";
    private static final String SESSION_EMAIL_AUTH_VERIFIED = "emailAuthVerified";
    private static final String SESSION_EMAIL_AUTH_EXPIRE_TIME = "emailAuthExpireTime";

    private final IUserService userService;
    private final IMailService mailService;
    private final SecureRandom secureRandom = new SecureRandom();

    @ResponseBody
    @GetMapping("/session")
    public Map<String, Object> getSession(HttpSession session) {
        Long userId = (Long) session.getAttribute("SS_USER_ID");
        String userName = (String) session.getAttribute("SS_USER_NAME");
        String userRole = (String) session.getAttribute("SS_USER_ROLE");
        String loginId = (String) session.getAttribute("SS_LOGIN_ID");

        if (userId == null || isBlank(userRole)) {
            return createResponse(false, "로그인이 필요합니다.");
        }

        Map<String, Object> response = createResponse(true, "로그인 상태입니다.");
        response.put("userId", userId);
        response.put("userName", userName);
        response.put("userRole", userRole);
        response.put("loginId", loginId);

        return response;
    }

    @ResponseBody
    @PostMapping("/logout")
    public Map<String, Object> logout(HttpSession session) {
        session.invalidate();
        return createResponse(true, "로그아웃되었습니다.");
    }

    @ResponseBody
    @PostMapping("/login")
    public Map<String, Object> login(HttpServletRequest request, HttpSession session) {
        String loginId = getParameter(request, "loginId");
        String password = getParameter(request, "password");
        log.info("login request loginId={}", loginId);

        UserDTO pDTO = new UserDTO();
        pDTO.setLoginId(loginId);
        pDTO.setPassword(password);

        try {
            UserDTO rDTO = userService.login(pDTO);

            session.setAttribute("SS_USER_ID", rDTO.getUserId());
            session.setAttribute("SS_USER_NAME", rDTO.getUserName());
            session.setAttribute("SS_USER_ROLE", rDTO.getUserRole());
            session.setAttribute("SS_LOGIN_ID", rDTO.getLoginId());

            Map<String, Object> response = createResponse(true, "로그인되었습니다.");
            response.put("userRole", rDTO.getUserRole());
            return response;
        } catch (IllegalArgumentException e) {
            log.error("로그인 실패 loginId={}", loginId, e);
            return createResponse(false, "아이디 또는 비밀번호를 확인해주세요.");
        } catch (Exception e) {
            log.error("로그인 처리 중 오류 loginId={}", loginId, e);
            return createResponse(false, "로그인 처리 중 오류가 발생했습니다.");
        }
    }

    @ResponseBody
    @PostMapping("/getLoginIdExists")
    public Map<String, Object> getLoginIdExists(HttpServletRequest request) {
        String loginId = getParameter(request, "loginId");
        log.info("loginId : {}", loginId);

        if (isBlank(loginId)) {
            return createResponse(false, "아이디를 입력해주세요.");
        }

        boolean duplicated = userService.isLoginIdDuplicated(loginId);
        Map<String, Object> response = createResponse(true,
                duplicated ? "이미 사용 중인 아이디입니다." : "사용 가능한 아이디입니다.");
        response.put("duplicated", duplicated);
        return response;
    }

    @ResponseBody
    @PostMapping("/sendEmailAuth")
    public Map<String, Object> sendEmailAuth(HttpServletRequest request, HttpSession session) {
        String email = getParameter(request, "email");
        log.info("email : {}", email);

        if (isBlank(email)) {
            return createResponse(false, "이메일을 입력해주세요.");
        }

        if (userService.isEmailDuplicated(email)) {
            return createResponse(false, "이미 사용 중인 이메일입니다.");
        }

        String authCode = createEmailAuthCode();

        MailDTO pDTO = new MailDTO();
        pDTO.setToMail(email);
        pDTO.setTitle("[같이가요] 회원가입 이메일 인증번호");
        pDTO.setContents("같이가요 회원가입 이메일 인증번호는 " + authCode + "입니다.\n인증번호는 5분 이내에 입력해주세요.");

        try {
            mailService.sendMail(pDTO);

            session.setAttribute(SESSION_EMAIL_AUTH_CODE, authCode);
            session.setAttribute(SESSION_EMAIL_AUTH_EMAIL, email);
            session.setAttribute(SESSION_EMAIL_AUTH_VERIFIED, false);
            session.setAttribute(SESSION_EMAIL_AUTH_EXPIRE_TIME, LocalDateTime.now().plusMinutes(5));

            return createResponse(true, "인증번호를 발송했습니다.");
        } catch (Exception e) {
            log.error("이메일 인증번호 발송 실패 email={}", email, e);
            clearEmailAuthSession(session);
            return createResponse(false, "인증번호 발송에 실패했습니다.");
        }
    }

    @ResponseBody
    @PostMapping("/checkEmailAuth")
    public Map<String, Object> checkEmailAuth(HttpServletRequest request, HttpSession session) {
        String email = getParameter(request, "email");
        String authCode = getParameter(request, "authCode");
        log.info("email auth check email={}", email);

        String sessionEmail = (String) session.getAttribute(SESSION_EMAIL_AUTH_EMAIL);
        String sessionAuthCode = (String) session.getAttribute(SESSION_EMAIL_AUTH_CODE);
        LocalDateTime expireTime = (LocalDateTime) session.getAttribute(SESSION_EMAIL_AUTH_EXPIRE_TIME);

        if (sessionEmail == null || sessionAuthCode == null || expireTime == null) {
            return createResponse(false, "인증정보가 올바르지 않습니다.");
        }

        if (LocalDateTime.now().isAfter(expireTime)) {
            clearEmailAuthSession(session);
            return createResponse(false, "인증시간이 만료되었습니다. 인증번호를 다시 받아주세요.");
        }

        if (!isBlank(email) && !isBlank(authCode)
                && email.equals(sessionEmail) && authCode.equals(sessionAuthCode)) {
            session.setAttribute(SESSION_EMAIL_AUTH_VERIFIED, true);
            session.removeAttribute(SESSION_EMAIL_AUTH_CODE);
            session.removeAttribute(SESSION_EMAIL_AUTH_EXPIRE_TIME);
            return createResponse(true, "인증이 완료되었습니다.");
        }

        return createResponse(false, "인증번호를 확인해주세요.");
    }

    @ResponseBody
    @PostMapping("/checkLinkCode")
    public Map<String, Object> checkLinkCode(HttpServletRequest request) {
        String linkCode = getParameter(request, "linkCode");
        log.info("linkCode : {}", linkCode);

        if (isBlank(linkCode)) {
            return createResponse(false, "연결코드를 입력해주세요.");
        }

        boolean valid = userService.isValidLinkCode(linkCode);

        return createResponse(valid, valid ? "연결코드가 확인되었습니다." : "유효하지 않은 코드입니다.");
    }

    @ResponseBody
    @PostMapping("/registerUser")
    public Map<String, Object> registerUser(HttpServletRequest request, HttpSession session) {
        String userName = getParameter(request, "userName");
        String loginId = getParameter(request, "loginId");
        String email = getParameter(request, "email");
        String password = getParameter(request, "password");

        log.info("USER register request userName={}, loginId={}, email={}", userName, loginId, email);

        if (!isEmailAuthVerified(session, email)) {
            return createResponse(false, "이메일 인증을 완료해주세요.");
        }

        UserDTO pDTO = new UserDTO();
        pDTO.setUserName(userName);
        pDTO.setLoginId(loginId);
        pDTO.setEmail(email);
        pDTO.setPassword(password);

        try {
            userService.registerUser(pDTO);
            clearEmailAuthSession(session);

            Map<String, Object> response = createResponse(true, "회원가입이 완료되었습니다.");
            response.put("linkCode", pDTO.getLinkCode());
            return response;
        } catch (IllegalArgumentException e) {
            log.error("USER 회원가입 실패 loginId={}, email={}", loginId, email, e);
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("USER 회원가입 처리 중 오류 loginId={}, email={}", loginId, email, e);
            return createResponse(false, "회원가입 처리 중 오류가 발생했습니다.");
        }
    }

    @ResponseBody
    @PostMapping("/registerGuardian")
    public Map<String, Object> registerGuardian(HttpServletRequest request, HttpSession session) {
        String linkCode = getParameter(request, "linkCode");
        String userName = getParameter(request, "userName");
        String loginId = getParameter(request, "loginId");
        String email = getParameter(request, "email");
        String password = getParameter(request, "password");
        String phone = getParameter(request, "phone");

        log.info("GUARDIAN register request userName={}, loginId={}, email={}, linkCode={}",
                userName, loginId, email, linkCode);

        if (!isEmailAuthVerified(session, email)) {
            return createResponse(false, "이메일 인증을 완료해주세요.");
        }

        UserDTO pDTO = new UserDTO();
        pDTO.setUserName(userName);
        pDTO.setLoginId(loginId);
        pDTO.setEmail(email);
        pDTO.setPassword(password);
        pDTO.setPhone(phone);

        try {
            userService.registerGuardian(pDTO, linkCode);
            clearEmailAuthSession(session);
            return createResponse(true, "보호자 회원가입이 완료되었습니다.");
        } catch (IllegalArgumentException e) {
            log.error("GUARDIAN 회원가입 실패 loginId={}, email={}, linkCode={}", loginId, email, linkCode, e);
            return createResponse(false, e.getMessage());
        } catch (Exception e) {
            log.error("GUARDIAN 회원가입 처리 중 오류 loginId={}, email={}, linkCode={}", loginId, email, linkCode, e);
            return createResponse(false, "회원가입 처리 중 오류가 발생했습니다.");
        }
    }

    private String createEmailAuthCode() {
        return String.format("%06d", secureRandom.nextInt(1000000));
    }

    private boolean isEmailAuthVerified(HttpSession session, String email) {
        Object verified = session.getAttribute(SESSION_EMAIL_AUTH_VERIFIED);
        String sessionEmail = (String) session.getAttribute(SESSION_EMAIL_AUTH_EMAIL);

        return Boolean.TRUE.equals(verified) && !isBlank(email) && email.equals(sessionEmail);
    }

    private void clearEmailAuthSession(HttpSession session) {
        session.removeAttribute(SESSION_EMAIL_AUTH_CODE);
        session.removeAttribute(SESSION_EMAIL_AUTH_EMAIL);
        session.removeAttribute(SESSION_EMAIL_AUTH_VERIFIED);
        session.removeAttribute(SESSION_EMAIL_AUTH_EXPIRE_TIME);
    }

    private Map<String, Object> createResponse(boolean success, String message) {
        Map<String, Object> response = new HashMap<>();
        response.put("success", success);
        response.put("message", message);
        return response;
    }

    private String getParameter(HttpServletRequest request, String name) {
        String value = request.getParameter(name);
        return value == null ? null : value.trim();
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
