import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { NgToastModule } from 'ng-angular-popup';
import { ResetPasswordComponent } from './reset-password.component';

const routes: Routes = [
  { path: '', component: ResetPasswordComponent }
];

@NgModule({
  declarations: [ResetPasswordComponent],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule.forChild(routes),
    NgToastModule
  ]
})
export class ResetPasswordModule { }
