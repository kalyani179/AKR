import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class NoAuthGuard implements CanActivate {
  constructor(private router: Router, private authService: AuthService) {}

  canActivate(): Observable<boolean> | boolean {
    const accessToken = localStorage.getItem('accessToken');
    const userId = localStorage.getItem('userId');

    if (accessToken) {
      if (this.authService.isTokenValid(accessToken)) {
        // If the token is valid, redirect to the profile page
        this.router.navigate(['/dashboard']);
        return false;
      } else if (userId) {
        // Access token is expired, try to refresh it using userId
        return this.authService.refreshToken().pipe(
          map((response: any) => {
            localStorage.setItem('accessToken', response.accessToken);
            // If the token is refreshed successfully, redirect to the profile page
            this.router.navigate(['/dashboard']);
            return false;
          }),
          catchError((error) => {
            console.error('Token refresh failed:', error);
            // If refreshing the token fails, allow access to the route
            return of(true);
          })
        );
      }
    }
    // If no access token is present, allow access to the route
    return true;
  }
}