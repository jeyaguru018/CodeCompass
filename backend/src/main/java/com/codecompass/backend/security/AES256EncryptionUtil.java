package com.codecompass.backend.security;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;
import java.util.Base64;
import java.nio.charset.StandardCharsets;

@Component
public class AES256EncryptionUtil {

    private static final String ALGORITHM = "AES";

    @Value("${encryption.key}")
    private String encryptionKeyBase64;

    public String encrypt(String plainText) {
        if (plainText == null) return null;
        try {
            SecretKeySpec secretKey = getSecretKey();
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey);
            byte[] encryptedBytes = cipher.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(encryptedBytes);
        } catch (Exception e) {
            throw new RuntimeException("Error while encrypting data", e);
        }
    }

    public String decrypt(String encryptedText) {
        if (encryptedText == null) return null;
        try {
            SecretKeySpec secretKey = getSecretKey();
            Cipher cipher = Cipher.getInstance(ALGORITHM);
            cipher.init(Cipher.DECRYPT_MODE, secretKey);
            byte[] decryptedBytes = cipher.doFinal(Base64.getDecoder().decode(encryptedText));
            return new String(decryptedBytes, StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new RuntimeException("Error while decrypting data", e);
        }
    }

    private SecretKeySpec getSecretKey() {
        byte[] keyBytes = Base64.getDecoder().decode(encryptionKeyBase64);
        if (keyBytes.length != 32) {
            throw new IllegalStateException("AES encryption key must be 256 bits (32 bytes)");
        }
        return new SecretKeySpec(keyBytes, ALGORITHM);
    }
}
