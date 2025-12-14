export default class PostCounselingMailDto {
  constructor({companyName, userName, position, phoneNum, email, content}) {
    this.companyName = companyName;
    this.userName = userName;
    this.position = position;
    this.phoneNum = phoneNum;
    this.email = email;
    this.content = content;
  }
}
