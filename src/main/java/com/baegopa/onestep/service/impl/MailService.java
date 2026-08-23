package com.baegopa.onestep.service.impl;

import com.baegopa.onestep.dto.MailDTO;
import com.baegopa.onestep.service.IMailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class MailService implements IMailService {

    private final JavaMailSender mailSender;

    @Value("${spring.mail.username:}")
    private String mailUsername;

    @Value("${spring.mail.password:}")
    private String mailPassword;

    @Override
    public void sendMail(MailDTO mailDTO) {
        validateMailSettings();

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(mailUsername);
        message.setTo(mailDTO.getToMail());
        message.setSubject(mailDTO.getTitle());
        message.setText(mailDTO.getContents());

        log.info("메일 발송 요청 toMail={}, title={}", mailDTO.getToMail(), mailDTO.getTitle());
        mailSender.send(message);
    }

    private void validateMailSettings() {
        if (isBlank(mailUsername) || isBlank(mailPassword)) {
            throw new IllegalStateException(
                    "메일 발송 설정이 없습니다. application-local.properties의 spring.mail.username / spring.mail.password를 확인하세요.");
        }
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
