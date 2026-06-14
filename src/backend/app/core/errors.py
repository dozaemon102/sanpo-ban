from fastapi import HTTPException


class AppError(HTTPException):
    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(status_code=status_code, detail={"error": {"code": code, "message": message}})


def validation_error(message: str) -> AppError:
    return AppError(400, "VALIDATION_ERROR", message)


def not_found(message: str = "Resource not found") -> AppError:
    return AppError(404, "NOT_FOUND", message)


def profile_not_setup() -> AppError:
    return AppError(409, "PROFILE_NOT_SETUP", "Profile setup is not completed")


def barcode_not_found(message: str = "Product not found in Open Food Facts") -> AppError:
    return AppError(404, "BARCODE_NOT_FOUND", message)


def off_unavailable(message: str = "Open Food Facts is temporarily unavailable") -> AppError:
    return AppError(502, "OFF_UNAVAILABLE", message)
